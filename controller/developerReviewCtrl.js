import asyncHandler from 'express-async-handler'
import slugify from 'slugify'
import DeveloperProject from '../models/developerProjectModel.js'
import DeveloperUnit from '../models/developerUnitModel.js'
import DeveloperPaymentPlan from '../models/developerPaymentPlanModel.js'
import DeveloperMedia from '../models/developerMediaModel.js'
import Property from '../models/propertyModel.js'
import ImageAsset from '../models/imgModel.js'
import User from '../models/userModel.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'
import { mapUnitSizeToPropertyFields } from '../utils/mapUnitSizeToProperty.js'
import {
  assertApprovedDeveloper,
  findOwnedProject,
} from '../utils/developerProjectAccess.js'
import { createNotification } from './notifications.controller.js'
import sendEmail from '../utils/nodeMailer.js'

export const REVIEW_STATUSES = [
  'Draft',
  'Submitted',
  'UnderReview',
  'ChangesRequested',
  'Approved',
  'Published',
  'Suspended',
]

const getDeveloperPortalBase = () =>
  String(process.env.DEVELOPER_PORTAL_URL || 'http://localhost:3012').replace(
    /\/$/,
    '',
  )

const getAdminPortalBase = () =>
  String(process.env.ADMIN_PORTAL_URL || 'http://localhost:3011').replace(
    /\/$/,
    '',
  )

const pushHistory = (project, { status, note = '', actor = null }) => {
  if (!Array.isArray(project.reviewHistory)) project.reviewHistory = []
  project.reviewHistory.push({
    status,
    note: String(note || '').trim(),
    actor: actor || null,
    at: new Date(),
  })
}

const findProjectByIdParam = async (id) => {
  const query = { isDeleted: false }
  const mongoId = sanitizeMongoId(id)
  if (mongoId) query._id = mongoId
  else query.uuid = String(id || '').trim()
  if (!query._id && !query.uuid) return null
  return DeveloperProject.findOne(query)
}

const loadPackageCounts = async (projectId) => {
  const [unitCount, planCount, mediaCount] = await Promise.all([
    DeveloperUnit.countDocuments({ project: projectId, isDeleted: false }),
    DeveloperPaymentPlan.countDocuments({
      project: projectId,
      isDeleted: false,
    }),
    DeveloperMedia.countDocuments({ project: projectId, isDeleted: false }),
  ])
  return { unitCount, planCount, mediaCount }
}

export const buildSubmitChecklist = async (project) => {
  const counts = await loadPackageCounts(project._id)
  const checks = [
    {
      key: 'name',
      label: 'Project name',
      ok: Boolean(String(project.name || '').trim()),
    },
    {
      key: 'location',
      label: 'City and country',
      ok: Boolean(
        String(project.city || '').trim() &&
        String(project.country || '').trim(),
      ),
    },
    {
      key: 'units',
      label: 'At least one unit',
      ok: counts.unitCount > 0,
    },
    {
      key: 'paymentPlans',
      label: 'At least one payment plan',
      ok: counts.planCount > 0,
    },
    {
      key: 'media',
      label: 'At least one media / document upload',
      ok: counts.mediaCount > 0,
    },
  ]
  return {
    checks,
    ready: checks.every((c) => c.ok),
    ...counts,
  }
}

const notifyDeveloperReview = async ({
  developer,
  project,
  title,
  message,
  relateRoute,
  emailSubject,
  emailHtml,
}) => {
  if (!developer?._id) return
  try {
    await createNotification({
      data: {
        userId: developer._id,
        userUUID: developer.uuid,
        UserRole: 'Developer',
        title,
        message,
        RelateRoute: relateRoute,
      },
    })
  } catch (err) {
    console.warn('Developer review notification failed:', err?.message || err)
  }

  if (developer.email && emailSubject && emailHtml) {
    sendEmail({
      to: developer.email,
      subject: emailSubject,
      html: emailHtml,
    }).then((result) => {
      if (!result.success) {
        console.warn(`Developer review email failed: ${result.error}`)
      }
    })
  }
}

const notifyAdminsOfSubmission = async (project, developer) => {
  try {
    const admins = await User.find({
      role: 'Admin',
      isDeleted: { $ne: true },
    }).select('_id uuid email name')

    for (const admin of admins) {
      await createNotification({
        data: {
          userId: admin._id,
          userUUID: admin.uuid,
          UserRole: 'Admin',
          title: 'Developer listing submitted',
          message: `${developer?.name || 'A developer'} submitted “${project.name}” for review.`,
          RelateRoute: 'developer-listings',
        },
      })
    }
  } catch (err) {
    console.warn('Admin listing-submit notify failed:', err?.message || err)
  }
}

const categoryToPropertyType = (category) => {
  const value = String(category || '').toLowerCase()
  if (value.includes('villa')) return 'Villa'
  if (value.includes('penthouse')) return 'Penthouse'
  if (value.includes('completed')) return 'Apartment'
  return 'Apartment'
}

/**
 * Merge all project image media into one ImageAsset so the public listing
 * gallery shows every uploaded photo (not just the latest media row).
 */
const buildMergedListingImageAsset = async ({
  projectId,
  unitId = null,
  developerUuid,
  existingAssetId = null,
}) => {
  const mediaQuery = {
    project: projectId,
    isDeleted: { $ne: true },
    fileKind: 'image',
    imageAsset: { $ne: null },
  }

  const mediaRows = await DeveloperMedia.find(mediaQuery)
    .populate({ path: 'imageAsset', select: 'images' })
    .sort({ createdAt: 1 })

  const preferred = []
  const rest = []
  for (const row of mediaRows) {
    const images = Array.isArray(row?.imageAsset?.images)
      ? row.imageAsset.images
      : []
    if (!images.length) continue
    const linkedToUnit =
      unitId &&
      row.unit &&
      String(row.unit) === String(unitId)
    if (linkedToUnit || !row.unit) preferred.push(...images)
    else rest.push(...images)
  }

  const combined = [...preferred, ...rest]
  const seen = new Set()
  const uniqueImages = combined.filter((img) => {
    const key =
      img?.s3Key ||
      img?.url ||
      img?.signedUrl ||
      `${img?.originalName || ''}-${img?.size || ''}`
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!uniqueImages.length) {
    return existingAssetId || null
  }

  // Never overwrite a single DeveloperMedia ImageAsset — those stay 1:1 with uploads.
  // Listing gallery gets its own merged ImageAsset (or an already-dedicated one).
  const sourceAssetIds = new Set(
    mediaRows.map((row) => String(row.imageAsset?._id || row.imageAsset || '')),
  )
  const canReuseExisting =
    existingAssetId && !sourceAssetIds.has(String(existingAssetId))

  if (canReuseExisting) {
    const existing = await ImageAsset.findOne({
      _id: existingAssetId,
      isDeleted: { $ne: true },
    })
    if (existing) {
      existing.images = uniqueImages
      await existing.save()
      return existing._id
    }
  }

  const created = await ImageAsset.create({
    userUUID: developerUuid || undefined,
    images: uniqueImages,
  })
  return created._id
}

const mapPaymentPlanToProperty = (plan) => {
  if (!plan) return { paymentPlanType: '', paymentPlan: [] }

  const name = String(plan.name || '').trim()
  // Prefer explicit plan label (e.g. "20/80") over legacy 10/60/30 summary fields
  const looksLikeRatio = /^\d{1,3}\/\d{1,3}(\/\d{1,3})?$/.test(name)

  let paymentPlanType = ''
  if (looksLikeRatio) {
    paymentPlanType = name
  } else {
    const down = Number(plan.downPaymentPercent || 0)
    const construction = Number(plan.constructionPercent || 0)
    const post = Number(plan.postHandoverPercent || 0)
    if (down || construction || post) {
      paymentPlanType =
        construction || post
          ? `${down}/${construction}/${post}`
          : `${down}/${Math.max(0, 100 - down)}`
    } else if (name) {
      paymentPlanType = name
    }
  }

  const paymentPlan = (plan.milestones || []).map((m, index, arr) => {
    const title =
      String(m.label || '').trim() ||
      String(m.dueLabel || '').trim() ||
      (index === 0
        ? 'Down Payment'
        : index === arr.length - 1
          ? 'Final Payment'
          : 'Payment Share')
    return {
      step: index + 1,
      stepLabel: `Step ${index + 1}`,
      paymentLabel: title,
      sharePercent: String(m.percent ?? ''),
      // Public UI shows `milestone` under the % — use the full step title
      milestone: title,
    }
  })
  return { paymentPlanType, paymentPlan }
}

const mapUnitPaymentPlan = (unit, plan) => {
  const type = String(unit?.paymentPlanType || '').trim()
  const steps = Array.isArray(unit?.paymentPlanSteps) ? unit.paymentPlanSteps : []
  if (type || steps.length) {
    return mapPaymentPlanToProperty({
      name: type,
      milestones: steps.map((s) => ({
        label: s.paymentLabel || s.milestone || '',
        percent: s.sharePercent,
        dueLabel: s.milestone || s.paymentLabel || '',
      })),
    })
  }
  return mapPaymentPlanToProperty(plan)
}

const buildPropertyPayloadFromUnit = ({
  project,
  unit,
  developer,
  plan,
  imageAssetId,
}) => {
  const companyName =
    String(unit?.developerName || '').trim() ||
    String(developer?.developerKyc?.companyName || '').trim() ||
    String(developer?.name || 'Developer').trim()
  const titleBase = (
    String(unit.title || '').trim() ||
    `${project.name} — Unit ${unit.unitNumber}`
  ).slice(0, 50)
  const priceFrom =
    Number(unit.priceFrom || unit.listingPrice || 0) ||
    Number(unit.priceTo || 0) ||
    1
  const priceTo = Number(unit.priceTo || unit.priceFrom || unit.listingPrice || 0) || priceFrom
  const phoneRaw = String(unit.phoneNumber || developer?.phone || '').replace(
    /\D/g,
    '',
  )
  const phoneNumber = phoneRaw ? Number(phoneRaw) : 971000000000
  const { paymentPlanType, paymentPlan } = mapUnitPaymentPlan(unit, plan)
  const neighbourhood =
    String(project.address || '').trim() ||
    String(project.city || '').trim() ||
    'UAE'
  const sizeFields = mapUnitSizeToPropertyFields(unit)
  const shortDesc = String(unit.description || unit.notes || project.description || '')
    .trim()
    .slice(0, 300)

  const payload = {
    assetType: 'Property Off Plan For Sale',
    country: String(project.country || 'United Arab Emirates').trim(),
    city: String(project.city || '').trim() || 'Dubai',
    neighbourhood,
    mapUrl: String(unit.mapUrl || project.mapUrl || '').trim(),
    propertyType: categoryToPropertyType(unit.category),
    title: titleBase,
    slug: slugify(`${titleBase}-${unit.uuid || unit._id}`.slice(0, 80), {
      lower: true,
      strict: true,
    }),
    phoneNumber: Number.isFinite(phoneNumber) ? phoneNumber : 971000000000,
    price: priceFrom,
    priceFrom,
    priceTo,
    ...sizeFields,
    bedrooms: unit.bedrooms ?? undefined,
    bathrooms: unit.bathrooms ?? undefined,
    propertyDescription: shortDesc,
    description: shortDesc,
    additionalDescription: String(unit.additionalDescription || '')
      .trim()
      .slice(0, 1000),
    developer: companyName,
    dldNumber: String(unit.dldNumber || project.reraNumber || '').trim(),
    paymentPlanType,
    paymentPlan,
    layout: String(unit.layout || '').trim() || undefined,
    numberOfFloors: String(unit.numberOfFloors || '').trim() || undefined,
    facilities: Array.isArray(unit.facilities) ? unit.facilities : [],
    customFacilities: Array.isArray(unit.customFacilities)
      ? unit.customFacilities
      : [],
    userId: developer._id,
    userUUID: developer.uuid,
    assetId: developer._id,
    status: 1,
    evaluationStatus: 'approved',
    listing: unit.listing === 'Private' ? 'Private' : 'Public',
    underProcess: false,
    occupancyStatus: 'Available',
  }

  const picturesId = imageAssetId || unit.pictures || null
  if (picturesId) payload.pictures = picturesId
  if (unit.thumbnailImg) payload.thumbnailImg = unit.thumbnailImg
  if (unit.qrScan) payload.qrScan = unit.qrScan
  if (unit.unitLayout) payload.unitLayout = unit.unitLayout
  if (unit.floorPlan) payload.floorPlan = unit.floorPlan
  if (unit.agencyAgreement) payload.agencyAgreement = unit.agencyAgreement

  if (unit.deliveryQuarter) payload.deliveryQuarter = String(unit.deliveryQuarter)
  if (unit.deliveryYear) payload.deliveryYear = String(unit.deliveryYear)

  if (!payload.deliveryYear && project.expectedHandoverDate) {
    const d = new Date(project.expectedHandoverDate)
    if (!Number.isNaN(d.getTime())) {
      payload.deliveryYear = String(d.getFullYear())
      const q = Math.floor(d.getMonth() / 3) + 1
      payload.deliveryQuarter = payload.deliveryQuarter || `Q${q}`
    }
  }

  return payload
}

/** Developer: readiness checklist for a project */
export const getProjectReviewChecklist = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.projectId, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }
  const checklist = await buildSubmitChecklist(project)
  await project.populate({ path: 'requestedDocuments.document' })
  return res.status(200).json({
    success: true,
    project: {
      _id: project._id,
      uuid: project.uuid,
      name: project.name,
      reviewStatus: project.reviewStatus || 'Draft',
      reviewNote: project.reviewNote || '',
      submittedAt: project.submittedAt,
      reviewedAt: project.reviewedAt,
      publishedAt: project.publishedAt,
      reviewHistory: project.reviewHistory || [],
      assignedEvaluator: project.assignedEvaluator,
      requestedDocuments: project.requestedDocuments || [],
    },
    checklist,
  })
})

/** Developer: submit project for FV review */
export const submitProjectForReview = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.projectId, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const current = project.reviewStatus || 'Draft'
  if (!['Draft', 'ChangesRequested', 'Suspended'].includes(current)) {
    return res.status(400).json({
      success: false,
      message: `Cannot submit while status is ${current}`,
    })
  }

  const checklist = await buildSubmitChecklist(project)
  if (!checklist.ready) {
    return res.status(400).json({
      success: false,
      message: 'Project is not ready for review',
      checklist,
    })
  }

  project.reviewStatus = 'Submitted'
  project.submittedAt = new Date()
  project.reviewNote = ''
  pushHistory(project, {
    status: 'Submitted',
    note: 'Developer submitted for review',
    actor: user._id,
  })
  await project.save()

  const portalBase = getDeveloperPortalBase()
  await notifyDeveloperReview({
    developer: user,
    project,
    title: 'Listing submitted for review',
    message: `“${project.name}” was submitted to Funds Verifier for audit.`,
    relateRoute: `/dashboard/projects/${project.uuid || project._id}/review`,
    emailSubject: 'Funds Verifier — listing submitted for review',
    emailHtml: `
      <h2>Listing submitted</h2>
      <p>Hello ${user.name || 'Developer'},</p>
      <p>Your project <strong>${project.name}</strong> has been submitted for Funds Verifier review.</p>
      <p><a href="${portalBase}/dashboard/projects/${project.uuid || project._id}/review">Track review status</a></p>
    `,
  })
  await notifyAdminsOfSubmission(project, user)

  return res.status(200).json({
    success: true,
    message: 'Project submitted for review',
    project,
    checklist,
  })
})

/** Developer: list own projects by review status */
export const listDeveloperReviews = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const status = String(req.query.status || '').trim()
  const query = { developer: user._id, isDeleted: false }
  if (status === 'Pending') {
    query.reviewStatus = {
      $in: ['Submitted', 'UnderReview', 'ChangesRequested'],
    }
  } else if (status === 'Approved') {
    query.reviewStatus = { $in: ['Approved', 'Published'] }
  } else if (status && status !== 'All') {
    query.reviewStatus = status
  } else {
    query.reviewStatus = { $ne: 'Draft' }
  }

  const projects = await DeveloperProject.find(query)
    .populate({ path: 'assignedEvaluator', select: 'name email uuid' })
    .sort({ submittedAt: -1, updatedAt: -1 })

  return res.status(200).json({ success: true, projects })
})

/** Developer: aggregate Super Admin document requests across projects */
export const listDeveloperDocumentRequests = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const filter = String(req.query.status || 'All').trim()

  const projects = await DeveloperProject.find({
    developer: user._id,
    isDeleted: false,
    'requestedDocuments.0': { $exists: true },
  })
    .select('name uuid requestedDocuments updatedAt')
    .populate({
      path: 'requestedDocuments.document',
      select: 'uuid Certificate originalName name',
    })
    .sort({ updatedAt: -1 })

  const allRows = []
  for (const project of projects) {
    const docs = Array.isArray(project.requestedDocuments)
      ? project.requestedDocuments
      : []
    for (const doc of docs) {
      const status = String(doc.status || 'Pending')
      allRows.push({
        _id: doc._id,
        name: doc.name,
        note: doc.note || '',
        status,
        requestedAt: doc.requestedAt || null,
        fulfilledAt: doc.fulfilledAt || null,
        document: doc.document || null,
        project: {
          _id: project._id,
          uuid: project.uuid,
          name: project.name,
        },
      })
    }
  }

  allRows.sort((a, b) => {
    const aPending = a.status !== 'Fulfilled'
    const bPending = b.status !== 'Fulfilled'
    if (aPending !== bPending) return aPending ? -1 : 1
    const aTime = new Date(a.requestedAt || 0).getTime()
    const bTime = new Date(b.requestedAt || 0).getTime()
    return bTime - aTime
  })

  const requests =
    filter === 'Pending'
      ? allRows.filter((r) => r.status !== 'Fulfilled')
      : filter === 'Fulfilled'
        ? allRows.filter((r) => r.status === 'Fulfilled')
        : allRows

  return res.status(200).json({
    success: true,
    requests,
    counts: {
      all: allRows.length,
      pending: allRows.filter((r) => r.status !== 'Fulfilled').length,
      fulfilled: allRows.filter((r) => r.status === 'Fulfilled').length,
    },
  })
})

/** Admin: list review queue */
export const listAdminReviewRequests = asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'pending').toLowerCase()
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const skip = (page - 1) * limit

  const query = { isDeleted: false }
  if (status === 'pending') {
    query.reviewStatus = {
      $in: ['Submitted', 'UnderReview', 'ChangesRequested'],
    }
  } else if (status === 'changes') {
    query.reviewStatus = 'ChangesRequested'
  } else if (status === 'approved') {
    // Published marketplace listings stay visible under Approved
    query.reviewStatus = { $in: ['Approved', 'Published'] }
  } else if (status === 'published') {
    query.reviewStatus = 'Published'
  } else if (status === 'suspended') {
    query.reviewStatus = 'Suspended'
  } else if (status !== 'all') {
    query.reviewStatus = {
      $in: ['Submitted', 'UnderReview', 'ChangesRequested'],
    }
  }

  const [total, projects] = await Promise.all([
    DeveloperProject.countDocuments(query),
    DeveloperProject.find(query)
      .populate({
        path: 'developer',
        select: 'name email phone uuid developerKyc',
      })
      .populate({ path: 'assignedEvaluator', select: 'name email uuid' })
      .populate({ path: 'reviewedBy', select: 'name email' })
      .sort({ submittedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit),
  ])

  return res.status(200).json({
    success: true,
    projects,
    currentPage: page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    total,
  })
})

/** Admin: detail with units, plans, media */
export const getAdminReviewRequest = asyncHandler(async (req, res) => {
  const project = await findProjectByIdParam(req.params.id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  await project.populate([
    { path: 'developer', select: 'name email phone uuid developerKyc' },
    { path: 'assignedEvaluator', select: 'name email uuid role' },
    { path: 'reviewedBy', select: 'name email' },
    { path: 'reviewHistory.actor', select: 'name email' },
    { path: 'thumbnailImg', select: 'images' },
    { path: 'pictures', select: 'images' },
    { path: 'requestedDocuments.document' },
  ])

  const [units, plans, media, checklist] = await Promise.all([
    DeveloperUnit.find({ project: project._id, isDeleted: false })
      .populate({ path: 'paymentPlan', select: 'name downPaymentPercent' })
      .sort({ unitNumber: 1 }),
    DeveloperPaymentPlan.find({
      project: project._id,
      isDeleted: false,
    }).sort({ createdAt: -1 }),
    DeveloperMedia.find({ project: project._id, isDeleted: false })
      .populate({ path: 'document' })
      .populate({ path: 'imageAsset', select: 'images' })
      .populate({ path: 'unit', select: 'unitNumber' })
      .sort({ createdAt: -1 }),
    buildSubmitChecklist(project),
  ])

  const evaluators = await User.find({
    role: 'Evaluator',
    isDeleted: { $ne: true },
    parentEvaluator: { $in: [null, undefined] },
  })
    .select('name email uuid')
    .sort({ name: 1 })
    .limit(100)

  return res.status(200).json({
    success: true,
    project,
    units,
    plans,
    media,
    checklist,
    evaluators,
  })
})

/** Admin: assign evaluator → UnderReview */
export const assignReviewEvaluator = asyncHandler(async (req, res) => {
  const project = await findProjectByIdParam(req.params.id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const evaluatorId = sanitizeMongoId(req.body?.evaluatorId)
  if (!evaluatorId) {
    return res
      .status(400)
      .json({ success: false, message: 'evaluatorId is required' })
  }

  const evaluator = await User.findOne({
    _id: evaluatorId,
    role: 'Evaluator',
    isDeleted: { $ne: true },
  })
  if (!evaluator) {
    return res.status(404).json({ success: false, message: 'Evaluator not found' })
  }

  if (!['Submitted', 'UnderReview', 'ChangesRequested'].includes(project.reviewStatus)) {
    return res.status(400).json({
      success: false,
      message: `Cannot assign evaluator while status is ${project.reviewStatus}`,
    })
  }

  project.assignedEvaluator = evaluator._id
  project.reviewStatus = 'UnderReview'
  pushHistory(project, {
    status: 'UnderReview',
    note: `Assigned to evaluator ${evaluator.name || evaluator.email}`,
    actor: req.user._id,
  })
  await project.save()

  const developer = await User.findById(project.developer)
  const portalBase = getDeveloperPortalBase()
  await notifyDeveloperReview({
    developer,
    project,
    title: 'Listing under review',
    message: `“${project.name}” is under review by Funds Verifier.`,
    relateRoute: `/dashboard/projects/${project.uuid || project._id}/units`,
    emailSubject: 'Funds Verifier — listing under review',
    emailHtml: `
      <h2>Listing under review</h2>
      <p>Hello ${developer?.name || 'Developer'},</p>
      <p>Your project <strong>${project.name}</strong> is now under review.</p>
      <p><a href="${portalBase}/dashboard/projects/${project.uuid || project._id}/units">View units</a></p>
    `,
  })

  return res.status(200).json({
    success: true,
    message: 'Evaluator assigned',
    project,
  })
})

/** Admin: set Approved / ChangesRequested / Suspended */
export const updateAdminReviewStatus = asyncHandler(async (req, res) => {
  const project = await findProjectByIdParam(req.params.id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const nextStatus = String(req.body?.reviewStatus || '').trim()
  const note = String(req.body?.reviewNote || '').trim()
  const allowed = ['Approved', 'ChangesRequested', 'Suspended', 'UnderReview']
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message: `reviewStatus must be one of: ${allowed.join(', ')}`,
    })
  }

  if (nextStatus === 'Approved') {
    if (!['Submitted', 'UnderReview'].includes(project.reviewStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve from ${project.reviewStatus}`,
      })
    }
  }

  if (nextStatus === 'ChangesRequested') {
    if (
      !['Submitted', 'UnderReview', 'Approved', 'Published'].includes(
        project.reviewStatus,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot request changes from ${project.reviewStatus}`,
      })
    }
  }

  if (nextStatus === 'Suspended') {
    if (!['Published', 'Approved'].includes(project.reviewStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot suspend from ${project.reviewStatus}`,
      })
    }
    // Hide linked Properties
    const units = await DeveloperUnit.find({
      project: project._id,
      isDeleted: false,
      publishedPropertyId: { $ne: null },
    })
    for (const unit of units) {
      await Property.updateOne(
        { _id: unit.publishedPropertyId },
        { $set: { status: 0, evaluationStatus: 'pending' } },
      )
    }
  }

  project.reviewStatus = nextStatus
  project.reviewNote = note
  project.reviewedAt = new Date()
  project.reviewedBy = req.user._id
  pushHistory(project, {
    status: nextStatus,
    note,
    actor: req.user._id,
  })
  await project.save()

  const developer = await User.findById(project.developer)
  const portalBase = getDeveloperPortalBase()
  const reviewPath = `/dashboard/projects/${project.uuid || project._id}/units`

  if (nextStatus === 'Approved') {
    await notifyDeveloperReview({
      developer,
      project,
      title: 'Listing approved',
      message: `“${project.name}” was approved and is live on the marketplace.`,
      relateRoute: reviewPath,
      emailSubject: 'Funds Verifier — listing approved',
      emailHtml: `
        <h2>Listing approved</h2>
        <p>Hello ${developer?.name || 'Developer'},</p>
        <p>Funds Verifier approved <strong>${project.name}</strong>. Your submitted units are now Available.</p>
        ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
        <p><a href="${portalBase}${reviewPath}">View units</a></p>
      `,
    })
  } else if (nextStatus === 'ChangesRequested') {
    await notifyDeveloperReview({
      developer,
      project,
      title: 'Changes requested',
      message: note
        ? `Changes requested on “${project.name}”: ${note}`
        : `Changes requested on “${project.name}”.`,
      relateRoute: reviewPath,
      emailSubject: 'Funds Verifier — listing changes requested',
      emailHtml: `
        <h2>Changes requested</h2>
        <p>Hello ${developer?.name || 'Developer'},</p>
        <p>Funds Verifier requested updates to <strong>${project.name}</strong>.</p>
        <p><strong>Note:</strong> ${note}</p>
        <p><a href="${portalBase}${reviewPath}">Update units</a></p>
      `,
    })
  } else if (nextStatus === 'Suspended') {
    await notifyDeveloperReview({
      developer,
      project,
      title: 'Listing suspended',
      message: `“${project.name}” was suspended and removed from public search.`,
      relateRoute: reviewPath,
      emailSubject: 'Funds Verifier — listing suspended',
      emailHtml: `
        <h2>Listing suspended</h2>
        <p>Hello ${developer?.name || 'Developer'},</p>
        <p><strong>${project.name}</strong> was suspended.</p>
        ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
      `,
    })
  }

  return res.status(200).json({
    success: true,
    message: `Review status updated to ${nextStatus}`,
    project,
  })
})

/** Admin: publish approved project units to marketplace Properties */
export const publishReviewRequest = asyncHandler(async (req, res) => {
  const project = await findProjectByIdParam(req.params.id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  if (!['Approved', 'Published'].includes(project.reviewStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Project must be Approved before publishing',
    })
  }

  const developer = await User.findById(project.developer)
  if (!developer) {
    return res.status(404).json({ success: false, message: 'Developer not found' })
  }

  const units = await DeveloperUnit.find({
    project: project._id,
    isDeleted: false,
    status: { $in: ['Pending', 'Available'] },
  }).populate('paymentPlan')

  if (!units.length) {
    return res.status(400).json({
      success: false,
      message: 'No Pending/Available units to publish',
    })
  }

  const defaultPlan = await DeveloperPaymentPlan.findOne({
    project: project._id,
    isDeleted: false,
    isDefault: true,
  })
  const anyPlan = await DeveloperPaymentPlan.findOne({
    project: project._id,
    isDeleted: false,
  }).sort({ createdAt: -1 })

  const published = []
  for (const unit of units) {
    const plan = unit.paymentPlan || defaultPlan || anyPlan
    const existingPicturesId =
      unit.publishedPropertyId
        ? (
          await Property.findById(unit.publishedPropertyId)
            .select('pictures')
            .lean()
        )?.pictures
        : null

    const imageAssetId =
      unit.pictures ||
      (await buildMergedListingImageAsset({
        projectId: project._id,
        unitId: unit._id,
        developerUuid: developer.uuid,
        existingAssetId: existingPicturesId || project.pictures || null,
      }))

    const payload = buildPropertyPayloadFromUnit({
      project,
      unit,
      developer,
      plan,
      imageAssetId,
    })

    let property
    if (unit.publishedPropertyId) {
      property = await Property.findByIdAndUpdate(
        unit.publishedPropertyId,
        { $set: payload },
        { new: true },
      )
    }
    if (!property) {
      property = await Property.create(payload)
    }

    unit.publishedPropertyId = property._id
    unit.publishedAt = new Date()
    unit.status = 'Available'
    await unit.save()
    published.push({
      unitId: unit._id,
      unitNumber: unit.unitNumber,
      propertyId: property._id,
      propertyUuid: property.uuid,
      slug: property.slug,
    })
  }

  project.reviewStatus = 'Published'
  project.publishedAt = new Date()
  project.reviewedAt = new Date()
  project.reviewedBy = req.user._id
  project.status = 'Active'
  pushHistory(project, {
    status: 'Published',
    note: `Published ${published.length} unit(s) to marketplace`,
    actor: req.user._id,
  })
  await project.save()

  const portalBase = getDeveloperPortalBase()
  const reviewPath = `/dashboard/projects/${project.uuid || project._id}/units`
  await notifyDeveloperReview({
    developer,
    project,
    title: 'Listing published',
    message: `“${project.name}” is live on the Funds Verifier marketplace.`,
    relateRoute: reviewPath,
    emailSubject: 'Funds Verifier — listing published',
    emailHtml: `
      <h2>Listing published</h2>
      <p>Hello ${developer.name || 'Developer'},</p>
      <p><strong>${project.name}</strong> (${published.length} unit(s)) is now live. Units are marked Available.</p>
      <p><a href="${portalBase}${reviewPath}">View units</a></p>
    `,
  })

  return res.status(200).json({
    success: true,
    message: 'Project published to marketplace',
    project,
    published,
  })
})

/** Admin: soft-delete a developer project from the review queue */
export const deleteAdminReviewRequest = asyncHandler(async (req, res) => {
  const project = await DeveloperProject.findOne({
    $or: [
      { uuid: req.params.id },
      { _id: sanitizeMongoId(req.params.id) },
    ],
    isDeleted: false,
  })
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  // Unlist any published marketplace properties for this project's units
  const units = await DeveloperUnit.find({
    project: project._id,
    isDeleted: { $ne: true },
    publishedPropertyId: { $ne: null },
  }).select('publishedPropertyId')

  for (const unit of units) {
    if (!unit.publishedPropertyId) continue
    await Property.findByIdAndUpdate(unit.publishedPropertyId, {
      $set: { status: 0, listing: 'Private' },
    })
  }

  project.isDeleted = true
  project.deletedAt = new Date()
  pushHistory(project, {
    status: project.reviewStatus || 'Deleted',
    note: 'Deleted by Super Admin',
    actor: req.user?._id,
  })
  await project.save()

  return res.status(200).json({
    success: true,
    message: 'Project deleted',
  })
})

/** Admin: request specific documents from developer for a project */
export const requestProjectDocuments = asyncHandler(async (req, res) => {
  const project = await findProjectByIdParam(req.params.id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const raw = Array.isArray(req.body?.documents) ? req.body.documents : []
  const documents = raw
    .map((d) => ({
      name: String(d?.name || '').trim(),
      note: String(d?.note || '').trim(),
    }))
    .filter((d) => d.name)

  if (!documents.length) {
    return res.status(400).json({
      success: false,
      message: 'Add at least one document name to request',
    })
  }

  const existing = Array.isArray(project.requestedDocuments)
    ? [...project.requestedDocuments.map((d) => d.toObject?.() || d)]
    : []
  const now = new Date()

  for (const doc of documents) {
    const idx = existing.findIndex(
      (d) =>
        String(d.name || '')
          .trim()
          .toLowerCase() === doc.name.toLowerCase() &&
        String(d.status || 'Pending') === 'Pending',
    )
    const entry = {
      name: doc.name,
      note: doc.note || '',
      requestedAt: now,
      status: 'Pending',
      document: null,
      fulfilledAt: null,
    }
    if (idx >= 0) existing[idx] = { ...existing[idx], ...entry }
    else existing.push(entry)
  }

  project.requestedDocuments = existing
  project.reviewStatus = 'ChangesRequested'
  project.reviewNote = `Requested documents: ${documents.map((d) => d.name).join(', ')}`
  project.reviewedAt = now
  project.reviewedBy = req.user._id
  pushHistory(project, {
    status: 'ChangesRequested',
    note: project.reviewNote,
    actor: req.user._id,
  })
  await project.save()

  const developer = await User.findById(project.developer)
  const portalBase = getDeveloperPortalBase()
  const docsPath = `/dashboard/document-storage`

  if (developer) {
    try {
      await createNotification({
        data: {
          userId: developer._id,
          userUUID: developer.uuid,
          UserRole: 'Developer',
          title: 'Document request',
          message: `Funds Verifier requested documents for “${project.name}”: ${documents.map((d) => d.name).join(', ')}.`,
          RelateRoute: docsPath,
        },
      })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (developer.email) {
      sendEmail({
        to: developer.email,
        subject: `Funds Verifier — documents requested for ${project.name}`,
        html: `
          <h2>Documents requested</h2>
          <p>Hello ${developer.name || 'Developer'},</p>
          <p>Funds Verifier Super Admin requested the following document(s) for <strong>${project.name}</strong>:</p>
          <ul>${documents.map((d) => `<li><strong>${d.name}</strong>${d.note ? ` — ${d.note}` : ''}</li>`).join('')}</ul>
          <p><a href="${portalBase}${docsPath}">Open Document Storage</a></p>
        `,
      }).then((result) => {
        if (!result.success) {
          console.warn(`Document request email failed: ${result.error}`)
        }
      })
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Document request sent to developer',
    project,
  })
})

/** Developer: fulfill one requested document by uploading a file */
export const fulfillProjectDocument = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.projectId, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const requestId = String(req.body?.requestId || '').trim()
  const documentId = sanitizeMongoId(req.body?.documentId)
  const name = String(req.body?.name || '').trim()

  if (!documentId) {
    return res.status(400).json({
      success: false,
      message: 'documentId is required',
    })
  }

  const requests = Array.isArray(project.requestedDocuments)
    ? project.requestedDocuments
    : []
  const target = requests.find((d) => {
    if (requestId && String(d._id) === requestId) return true
    if (
      name &&
      String(d.name || '')
        .trim()
        .toLowerCase() === name.toLowerCase() &&
      String(d.status || 'Pending') === 'Pending'
    ) {
      return true
    }
    return false
  })

  if (!target) {
    return res.status(404).json({
      success: false,
      message: 'Requested document not found',
    })
  }

  target.document = documentId
  target.status = 'Fulfilled'
  target.fulfilledAt = new Date()
  project.markModified('requestedDocuments')

  // Also store in project media so it appears in document storage
  await DeveloperMedia.create({
    project: project._id,
    developer: user._id,
    unit: null,
    docType: 'Other',
    title: target.name || 'Requested document',
    fileKind: 'document',
    document: documentId,
  })

  pushHistory(project, {
    status: project.reviewStatus || 'ChangesRequested',
    note: `Uploaded requested document: ${target.name}`,
    actor: user._id,
  })
  await project.save()

  await project.populate({ path: 'requestedDocuments.document' })

  return res.status(200).json({
    success: true,
    message: 'Document uploaded',
    project: {
      requestedDocuments: project.requestedDocuments || [],
      reviewHistory: project.reviewHistory || [],
    },
  })
})
