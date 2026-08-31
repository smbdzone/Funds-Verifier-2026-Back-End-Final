import asyncHandler from 'express-async-handler'
import DeveloperUnit, {
  UNIT_CATEGORIES,
  UNIT_STATUSES,
} from '../models/developerUnitModel.js'
import { requireOwnedProject } from '../utils/developerProjectAccess.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'
import { syncPublishedPropertyFromUnit } from '../utils/syncPublishedUnitProperty.js'
import { AssetsListingsPricing } from '../utils/AssetsListingsPricing.js'

const parseOptionalNumber = (value) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim())
  return Number.isNaN(n) ? null : n
}

const parseStringArray = (value) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v || '').trim()).filter(Boolean)
}

const parsePaymentSteps = (value) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return []
  return value
    .map((step) => ({
      paymentLabel: String(step?.paymentLabel || step?.milestone || '').trim(),
      sharePercent: String(step?.sharePercent ?? '').replace(/%/g, '').trim(),
      milestone: String(step?.milestone || step?.paymentLabel || '').trim(),
    }))
    .filter((step) => {
      const n = Number(step.sharePercent)
      return step.sharePercent !== '' && Number.isFinite(n) && n > 0
    })
    .map((step, index, arr) => ({
      step: index + 1,
      stepLabel: `Step ${index + 1}`,
      paymentLabel:
        step.paymentLabel ||
        (index === 0
          ? 'Down Payment'
          : index === arr.length - 1
            ? 'Final Payment'
            : 'Payment Share'),
      sharePercent: step.sharePercent,
      milestone:
        step.milestone ||
        (index === 0
          ? 'Down Payment'
          : index === arr.length - 1
            ? 'Final Payment'
            : 'Payment Share'),
    }))
}

const slugUnitNumber = (title) => {
  const base = String(title || 'unit')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return base || `unit-${Date.now().toString(36)}`
}

const buildUnitPayload = (body, { forCreate = false } = {}) => {
  let unitNumber =
    body.unitNumber !== undefined
      ? String(body.unitNumber || '').trim()
      : undefined

  const title =
    body.title !== undefined ? String(body.title || '').trim().slice(0, 60) : undefined

  if (forCreate && !unitNumber) {
    unitNumber = slugUnitNumber(title || body.unitNumber)
  }

  if (forCreate && !unitNumber) {
    return { ok: false, status: 400, message: 'Title or unit number is required' }
  }

  if (body.category && !UNIT_CATEGORIES.includes(body.category)) {
    return {
      ok: false,
      status: 400,
      message: `Category must be one of: ${UNIT_CATEGORIES.join(', ')}`,
    }
  }

  if (body.status && !UNIT_STATUSES.includes(body.status)) {
    return {
      ok: false,
      status: 400,
      message: `Status must be one of: ${UNIT_STATUSES.join(', ')}`,
    }
  }

  const sizeUnitRaw =
    body.sizeUnit !== undefined
      ? String(body.sizeUnit || 'SQFT').trim().toUpperCase()
      : undefined
  if (sizeUnitRaw && !['SQFT', 'SQM'].includes(sizeUnitRaw)) {
    return {
      ok: false,
      status: 400,
      message: 'sizeUnit must be SQFT or SQM',
    }
  }

  const listingRaw =
    body.listing !== undefined ? String(body.listing || '').trim() : undefined
  if (listingRaw && !['Public', 'Private', ''].includes(listingRaw)) {
    return {
      ok: false,
      status: 400,
      message: 'listing must be Public or Private',
    }
  }

  const payload = {}
  const fields = {
    unitNumber,
    title,
    phoneNumber:
      body.phoneNumber !== undefined
        ? String(body.phoneNumber || '').trim()
        : undefined,
    floor: body.floor !== undefined ? String(body.floor || '').trim() : undefined,
    category: body.category,
    builtUpArea: parseOptionalNumber(body.builtUpArea),
    builtUpAreaTo: parseOptionalNumber(body.builtUpAreaTo),
    sizeUnit: sizeUnitRaw,
    orientation:
      body.orientation !== undefined
        ? String(body.orientation || '').trim()
        : undefined,
    view: body.view !== undefined ? String(body.view || '').trim() : undefined,
    listingPrice: parseOptionalNumber(
      body.listingPrice !== undefined ? body.listingPrice : body.priceFrom,
    ),
    priceFrom: parseOptionalNumber(body.priceFrom),
    priceTo: parseOptionalNumber(body.priceTo),
    currency:
      body.currency !== undefined
        ? String(body.currency || 'AED').trim() || 'AED'
        : undefined,
    listing:
      listingRaw === undefined
        ? undefined
        : AssetsListingsPricing({
            type: 'property',
            listing: listingRaw || 'Public',
            priceFrom: body.priceFrom,
            listingPrice: body.listingPrice,
          }),
    bedrooms: parseOptionalNumber(body.bedrooms),
    bathrooms: parseOptionalNumber(body.bathrooms),
    description:
      body.description !== undefined
        ? String(body.description || '').trim().slice(0, 300)
        : undefined,
    additionalDescription:
      body.additionalDescription !== undefined
        ? String(body.additionalDescription || '').trim().slice(0, 1000)
        : undefined,
    developerName:
      body.developerName !== undefined
        ? String(body.developerName || '').trim()
        : undefined,
    dldNumber:
      body.dldNumber !== undefined
        ? String(body.dldNumber || '').replace(/[^\d]/g, '').trim()
        : undefined,
    deliveryQuarter:
      body.deliveryQuarter !== undefined
        ? String(body.deliveryQuarter || '').trim()
        : undefined,
    deliveryYear:
      body.deliveryYear !== undefined
        ? String(body.deliveryYear || '').trim()
        : undefined,
    layout:
      body.layout !== undefined ? String(body.layout || '').trim() : undefined,
    numberOfFloors:
      body.numberOfFloors !== undefined
        ? String(body.numberOfFloors || '').trim()
        : undefined,
    mapUrl:
      body.mapUrl !== undefined ? String(body.mapUrl || '').trim() : undefined,
    paymentPlanType:
      body.paymentPlanType !== undefined
        ? String(body.paymentPlanType || '').trim()
        : undefined,
    paymentPlanSteps: parsePaymentSteps(
      body.paymentPlanSteps !== undefined
        ? body.paymentPlanSteps
        : Array.isArray(body.paymentPlan)
          ? body.paymentPlan
          : undefined,
    ),
    paymentPlan:
      body.paymentPlanId !== undefined
        ? sanitizeMongoId(body.paymentPlanId) || null
        : body.paymentPlan !== undefined &&
          typeof body.paymentPlan === 'string'
          ? sanitizeMongoId(body.paymentPlan) || null
          : undefined,
    pictures: body.pictures !== undefined ? sanitizeMongoId(body.pictures) : undefined,
    thumbnailImg:
      body.thumbnailImg !== undefined
        ? sanitizeMongoId(body.thumbnailImg)
        : undefined,
    qrScan: body.qrScan !== undefined ? sanitizeMongoId(body.qrScan) : undefined,
    video: body.video !== undefined ? sanitizeMongoId(body.video) : undefined,
    unitLayout:
      body.unitLayout !== undefined
        ? sanitizeMongoId(body.unitLayout)
        : undefined,
    floorPlan:
      body.floorPlan !== undefined ? sanitizeMongoId(body.floorPlan) : undefined,
    agencyAgreement:
      body.agencyAgreement !== undefined
        ? sanitizeMongoId(body.agencyAgreement)
        : undefined,
    facilities: parseStringArray(body.facilities),
    customFacilities: parseStringArray(body.customFacilities),
    status: body.status,
    notes: body.notes !== undefined ? String(body.notes || '').trim() : undefined,
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value
  }

  return { ok: true, payload }
}

const findOwnedUnit = async (unitId, projectId) => {
  const query = { project: projectId, isDeleted: false }
  const mongoId = sanitizeMongoId(unitId)
  if (mongoId) query._id = mongoId
  else query.uuid = String(unitId || '').trim()
  if (!query._id && !query.uuid) return null
  return DeveloperUnit.findOne(query)
}

export const listUnits = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const units = await DeveloperUnit.find({
    project: project._id,
    isDeleted: false,
  })
    .populate({ path: 'paymentPlan', select: 'name uuid' })
    .populate({ path: 'pictures', select: 'images' })
    .populate({ path: 'thumbnailImg', select: 'images' })
    .sort({ updatedAt: -1 })

  return res.status(200).json({
    success: true,
    units,
    categories: UNIT_CATEGORIES,
    statuses: UNIT_STATUSES,
  })
})

export const getUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }
  await unit.populate([
    { path: 'paymentPlan', select: 'name uuid' },
    { path: 'pictures', select: 'images' },
    { path: 'thumbnailImg', select: 'images' },
    { path: 'qrScan', select: 'images' },
    { path: 'video', select: 'videos' },
    { path: 'unitLayout', select: 'images' },
    { path: 'floorPlan', select: 'images' },
    { path: 'agencyAgreement' },
  ])
  return res.status(200).json({
    success: true,
    unit,
    projectCity: project.city || '',
    projectReviewStatus: project.reviewStatus || 'Draft',
  })
})

export const createUnit = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const built = buildUnitPayload(req.body, { forCreate: true })
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  // New units stay Draft until "Submit for approval"
  if (!built.payload.status) built.payload.status = 'Draft'

  try {
    const unit = await DeveloperUnit.create({
      ...built.payload,
      project: project._id,
      developer: user._id,
    })
    return res.status(201).json({ success: true, message: 'Unit created', unit })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A unit with this number already exists in the project',
      })
    }
    throw error
  }
})

export const updateUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }

  if (unit.status === 'Available') {
    return res.status(400).json({
      success: false,
      message:
        'This unit is published. Editing is not allowed until changes are requested.',
    })
  }

  const built = buildUnitPayload(req.body, { forCreate: false })
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  // Developers cannot force Available — only Super Admin publish does that
  if (built.payload.status === 'Available' && unit.status !== 'Available') {
    delete built.payload.status
  }

  Object.assign(unit, built.payload)
  try {
    await unit.save()
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A unit with this number already exists in the project',
      })
    }
    throw error
  }

  await syncPublishedPropertyFromUnit(unit)
  return res.status(200).json({ success: true, message: 'Unit updated', unit })
})

/** Developer: submit unit listing for Super Admin approval */
export const submitUnitForApproval = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }

  if (unit.status === 'Available') {
    return res.status(400).json({
      success: false,
      message:
        'This unit is already published. Editing or re-submitting is not allowed.',
    })
  }

  if (!['Draft', 'Pending'].includes(unit.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot submit unit while status is ${unit.status}`,
    })
  }

  const title = String(unit.title || '').trim()
  if (!title) {
    return res.status(400).json({
      success: false,
      message: 'Title is required before submitting for approval',
    })
  }
  if (!unit.pictures && !unit.thumbnailImg) {
    return res.status(400).json({
      success: false,
      message: 'Upload at least a thumbnail or pictures before submitting',
    })
  }

  unit.status = 'Pending'
  unit.submittedAt = new Date()
  await unit.save()

  const current = project.reviewStatus || 'Draft'
  project.reviewHistory = project.reviewHistory || []
  project.reviewHistory.push({
    status: 'Submitted',
    note: `Unit “${title || unit.unitNumber}” submitted for approval`,
    actor: user._id,
    at: new Date(),
  })

  if (['Approved', 'Published', 'UnderReview', 'Submitted'].includes(current)) {
    // Keep live / in-review projects as they are; Super Admin can publish new Pending units.
    await project.save()
  } else {
    project.reviewStatus = 'Submitted'
    project.submittedAt = project.submittedAt || new Date()
    await project.save()
  }

  return res.status(200).json({
    success: true,
    message: 'Submitted for approval',
    unit,
    project: {
      reviewStatus: project.reviewStatus,
      submittedAt: project.submittedAt,
    },
  })
})

export const deleteUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }

  unit.isDeleted = true
  unit.deletedAt = new Date()
  await unit.save()
  await syncPublishedPropertyFromUnit(unit)

  return res.status(200).json({ success: true, message: 'Unit removed' })
})

export const bulkCreateUnits = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const rows = Array.isArray(req.body?.units) ? req.body.units : []
  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'units array required' })
  }

  let createdCount = 0
  const errors = []
  for (let i = 0; i < rows.length; i += 1) {
    const built = buildUnitPayload(rows[i], { forCreate: true })
    if (!built.ok) {
      errors.push({ index: i, message: built.message })
      continue
    }
    try {
      await DeveloperUnit.create({
        ...built.payload,
        status: 'Draft',
        project: project._id,
        developer: user._id,
      })
      createdCount += 1
    } catch (error) {
      errors.push({
        index: i,
        message:
          error?.code === 11000
            ? 'Duplicate unit number'
            : error?.message || 'Failed',
      })
    }
  }

  return res.status(200).json({
    success: true,
    createdCount,
    errorCount: errors.length,
    errors,
  })
})
