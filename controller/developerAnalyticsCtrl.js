import asyncHandler from 'express-async-handler'
import DeveloperProject from '../models/developerProjectModel.js'
import DeveloperUnit, { UNIT_STATUSES } from '../models/developerUnitModel.js'
import Property from '../models/propertyModel.js'
import Booking from '../models/Booking.js'
import { assertApprovedDeveloper } from '../utils/developerProjectAccess.js'

const PIPELINE_STATUSES = ['Reserved', 'Under Offer', 'Sold']

/**
 * CRM + transaction analytics for the developer dashboard.
 * Uses unit pipeline statuses, published Property analytics, and viewing bookings.
 */
export const getDeveloperCrmAnalytics = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)

  const projects = await DeveloperProject.find({
    developer: user._id,
    isDeleted: false,
  })
    .select('_id uuid name reviewStatus status city country')
    .sort({ updatedAt: -1 })
    .lean()

  const projectIds = projects.map((p) => p._id)
  const projectById = new Map(projects.map((p) => [String(p._id), p]))

  const units = projectIds.length
    ? await DeveloperUnit.find({
        developer: user._id,
        isDeleted: false,
        project: { $in: projectIds },
      })
        .select(
          'uuid unitNumber floor category listingPrice currency status project publishedPropertyId publishedAt updatedAt',
        )
        .sort({ updatedAt: -1 })
        .lean()
    : []

  const byStatus = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0]))
  let totalStockValue = 0
  let publishedCount = 0
  const publishedPropertyIds = []

  for (const unit of units) {
    if (byStatus[unit.status] !== undefined) byStatus[unit.status] += 1
    const price = Number(unit.listingPrice)
    if (Number.isFinite(price) && price > 0) totalStockValue += price
    if (unit.publishedPropertyId) {
      publishedCount += 1
      publishedPropertyIds.push(unit.publishedPropertyId)
    }
  }

  const properties = publishedPropertyIds.length
    ? await Property.find({
        _id: { $in: publishedPropertyIds },
        isDeleted: { $ne: true },
      })
        .select('uuid title slug status analytics price')
        .lean()
    : []

  const propertyById = new Map(properties.map((p) => [String(p._id), p]))

  let totalImpressions = 0
  let totalClicks = 0
  const listingPerformance = []

  for (const unit of units) {
    if (!unit.publishedPropertyId) continue
    const property = propertyById.get(String(unit.publishedPropertyId))
    const impressions = Number(property?.analytics?.impressions) || 0
    const clicks = Number(property?.analytics?.clicks) || 0
    totalImpressions += impressions
    totalClicks += clicks
    const project = projectById.get(String(unit.project))
    listingPerformance.push({
      unitId: unit._id,
      unitUuid: unit.uuid,
      unitNumber: unit.unitNumber,
      status: unit.status,
      listingPrice: unit.listingPrice,
      currency: unit.currency || 'AED',
      projectName: project?.name || '—',
      projectId: project?.uuid || project?._id,
      propertyUuid: property?.uuid || null,
      propertyTitle: property?.title || null,
      propertySlug: property?.slug || null,
      marketplaceStatus: property?.status,
      impressions,
      clicks,
      publishedAt: unit.publishedAt,
    })
  }

  listingPerformance.sort(
    (a, b) => b.impressions + b.clicks - (a.impressions + a.clicks),
  )

  const pipelineUnits = units
    .filter((u) => PIPELINE_STATUSES.includes(u.status))
    .map((unit) => {
      const project = projectById.get(String(unit.project))
      const property = unit.publishedPropertyId
        ? propertyById.get(String(unit.publishedPropertyId))
        : null
      return {
        unitId: unit._id,
        unitUuid: unit.uuid,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        category: unit.category,
        status: unit.status,
        listingPrice: unit.listingPrice,
        currency: unit.currency || 'AED',
        projectName: project?.name || '—',
        projectId: project?.uuid || project?._id,
        propertyUuid: property?.uuid || null,
        updatedAt: unit.updatedAt,
      }
    })

  const pipelineValue = pipelineUnits.reduce((sum, u) => {
    const price = Number(u.listingPrice)
    return sum + (Number.isFinite(price) && price > 0 ? price : 0)
  }, 0)

  const byReviewStatus = {}
  for (const project of projects) {
    const key = project.reviewStatus || 'Draft'
    byReviewStatus[key] = (byReviewStatus[key] || 0) + 1
  }

  const publishedPropertyUuids = properties
    .map((p) => p.uuid)
    .filter(Boolean)

  const viewings = await Booking.find({
    isDeleted: { $ne: true },
    $or: [
      { assetHolderId: user._id },
      { assetHolderUUID: user.uuid },
      ...(publishedPropertyUuids.length
        ? [{ 'productData.uuid': { $in: publishedPropertyUuids } }]
        : []),
    ],
  })
    .populate({ path: 'brokerId', select: 'name email phone uuid' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  const crmViewings = viewings.map((v) => ({
    id: v._id,
    uuid: v.uuid,
    status: v.status,
    message: v.message || '',
    createdAt: v.createdAt,
    buyer: {
      name: v.brokerId?.name || 'Buyer',
      email: v.brokerId?.email || '',
      phone: v.brokerId?.phone || '',
      uuid: v.brokerId?.uuid || v.brokerUUID || '',
    },
    listingTitle:
      v.productData?.title ||
      v.productData?.name ||
      v.productData?.unitNumber ||
      'Listing',
    listingUuid: v.productData?.uuid || null,
    listingSlug: v.productData?.slug || null,
  }))

  return res.status(200).json({
    success: true,
    summary: {
      projectCount: projects.length,
      unitCount: units.length,
      publishedCount,
      totalStockValue,
      pipelineCount: pipelineUnits.length,
      pipelineValue,
      totalImpressions,
      totalClicks,
      viewingCount: crmViewings.length,
      byStatus,
      byReviewStatus,
    },
    pipeline: pipelineUnits,
    listingPerformance: listingPerformance.slice(0, 40),
    viewings: crmViewings,
    projects: projects.map((p) => ({
      id: p.uuid || p._id,
      name: p.name,
      reviewStatus: p.reviewStatus,
      status: p.status,
      city: p.city,
      country: p.country,
    })),
  })
})
