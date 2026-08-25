import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import Report from '../models/reportModel.js'
import Request3D from '../models/request3DModel.js'
import { sanitizeUUID } from './nosqlSanitizer.js'

export function modelForAssetType(assetType) {
  if (!assetType || typeof assetType !== 'string') return null
  const normalized = assetType.toLowerCase()
  if (normalized.includes('property')) return Property
  if (normalized.includes('car')) return Car
  if (normalized.includes('jewel')) return Jewelry
  if (normalized.includes('boat')) return Boat
  return null
}

function listingQueryFromPremiumRecord(record) {
  if (!record) return null
  const uuid = sanitizeUUID(record.productUUID)
  if (uuid) {
    return { uuid, isDeleted: { $ne: true } }
  }
  if (record.productId) {
    return { _id: record.productId, isDeleted: { $ne: true } }
  }
  return null
}

/** Do not let create/update wipe or cast empty ObjectId refs (legacy frontend sends ""). */
export function stripNullPremiumRefs(body) {
  if (!body || typeof body !== 'object') return body
  for (const key of [
    'technicalReport',
    'video3DWalkthrough',
    'evaluationCertificate',
    'video',
    'qrScan',
    'pictures',
    'thumbnailImg',
    'agencyAgreement',
  ]) {
    if (body[key] === null || body[key] === '' || body[key] === undefined) {
      delete body[key]
    }
  }
  return body
}

export function listingMetaFromApproval(approval) {
  const listing = approval?.listing
  if (!listing) return {}
  return {
    productId: listing._id,
    productUUID: listing.uuid,
    productTitle: listing.title || null,
  }
}

/** Keep property.car/boat/jewelry → technicalReport ObjectId in sync. */
export async function linkTechnicalReportToListing(report) {
  if (!report?._id) return
  const Model = modelForAssetType(report.assetType)
  const query = listingQueryFromPremiumRecord(report)
  if (!Model || !query) return

  const update = { technicalReport: report._id }
  if (typeof report.IsRecommended === 'boolean') {
    update.isRecommendedAsset = report.IsRecommended
  }

  await Model.updateOne(query, { $set: update })
}

/** Keep listing → video3DWalkthrough ObjectId in sync. */
export async function linkWalkthroughToListing(request) {
  if (!request?._id) return
  const Model = modelForAssetType(request.assetType)
  const query = listingQueryFromPremiumRecord(request)
  if (!Model || !query) return
  await Model.updateOne(query, { $set: { video3DWalkthrough: request._id } })
}

/** Ensure dashboard rows show the linked listing title when productTitle was not stored. */
export async function fillListingTitleOnPremiumRecord(record) {
  if (!record) return record
  if (String(record.productTitle || '').trim()) return record

  const Model = modelForAssetType(record.assetType)
  const query = listingQueryFromPremiumRecord(record)
  if (!Model || !query) return record

  const listing = await Model.findOne(query).select('title').lean()
  if (listing?.title) {
    record.productTitle = listing.title
  }
  return record
}

export async function markReportDelivered(reportUuid, extra = {}) {
  return Report.findOneAndUpdate(
    { uuid: reportUuid, isDeleted: { $ne: true } },
    {
      $set: {
        status: 'successful',
        ...extra,
      },
    },
    { new: true },
  )
}

export async function markWalkthroughDelivered(requestUuid, extra = {}) {
  return Request3D.findOneAndUpdate(
    { uuid: requestUuid, isDeleted: { $ne: true } },
    {
      $set: {
        status: 'successful',
        ...extra,
      },
    },
    { new: true },
  )
}

const PAID_PAYMENT_STATUSES = new Set(['paid', 'succeeded', 'active', 'approved'])
const PAID_RECORD_STATUSES = new Set(['successful'])

export function isPremiumServiceRecordPaid(record) {
  if (!record) return false
  const paymentStatus = String(record.payment_method_status || '').toLowerCase()
  const recordStatus = String(record.status || '').toLowerCase()
  return (
    PAID_PAYMENT_STATUSES.has(paymentStatus) ||
    PAID_RECORD_STATUSES.has(recordStatus)
  )
}

export function isPremiumServiceRecordDelivered(record) {
  if (!record || typeof record !== 'object') return false
  if (String(record.status || '').toLowerCase() !== 'successful') return false

  const link = typeof record.link === 'string' ? record.link.trim() : ''
  if (link && (link.startsWith('http://') || link.startsWith('https://'))) {
    return true
  }

  const reportFile = record.reportFile
  if (typeof reportFile === 'string' && reportFile.trim()) return true
  if (reportFile && typeof reportFile === 'object') {
    return Boolean(reportFile._id || reportFile.uuid)
  }
  return false
}

export async function loadPaidPremiumRecord(product, service) {
  let request3D = null
  let reportTech = null
  if (!product) return { request3D, reportTech }

  if (['_3dwalkthrough', 'all'].includes(service) && product.video3DWalkthrough) {
    request3D = await Request3D.findOne({
      _id: product.video3DWalkthrough,
      isDeleted: { $ne: true },
    })
    if (request3D && !isPremiumServiceRecordPaid(request3D)) request3D = null
  }
  if (['surveyor', 'all'].includes(service) && product.technicalReport) {
    reportTech = await Report.findOne({
      _id: product.technicalReport,
      isDeleted: { $ne: true },
    })
    if (reportTech && !isPremiumServiceRecordPaid(reportTech)) reportTech = null
  }
  return { request3D, reportTech }
}

export function premiumBookingFieldsFromInput(input = {}, { applyPrice = false } = {}) {
  const set = {}
  if (input.dateTime) set.dateTime = input.dateTime
  if (typeof input.category === 'string' && input.category.trim()) {
    set.category = input.category.trim()
  }
  if (typeof input.subCategory === 'string' && input.subCategory.trim()) {
    set.subCategory = input.subCategory.trim()
  }
  if (input.value != null && String(input.value).trim()) {
    set.value = String(input.value).trim()
  }
  if (typeof input.phone === 'string' && input.phone.trim()) {
    set.phone = input.phone.trim()
  }
  if (applyPrice) {
    const fullPrice = Number(input.fullPrice ?? input.price)
    if (Number.isFinite(fullPrice) && fullPrice > 0) set.price = fullPrice
  }
  return set
}

export async function applyPremiumBookingFields({
  service,
  request3DId,
  reportTechId,
  fields = {},
}) {
  if (!fields || !Object.keys(fields).length) return

  if (['_3dwalkthrough', 'all'].includes(service) && request3DId) {
    await Request3D.findByIdAndUpdate(request3DId, { $set: fields })
  }
  if (['surveyor', 'all'].includes(service) && reportTechId) {
    await Report.findByIdAndUpdate(reportTechId, { $set: fields })
  }
}

/**
 * Remove unpaid premium service refs so the user can pick another slot or payment method.
 */
export async function clearUnpaidPremiumOnListing(product, AssetModel, fields) {
  if (!product?._id || !AssetModel || !Array.isArray(fields) || !fields.length) {
    return product
  }

  const unset = {}
  for (const field of fields) {
    const refId = product[field]
    if (!refId) continue

    const RecordModel = field === 'technicalReport' ? Report : Request3D
    const record = await RecordModel.findOne({
      _id: refId,
      isDeleted: { $ne: true },
    })
    if (!record || isPremiumServiceRecordPaid(record)) continue

    // Checkout may still be in progress — do not remove the request yet.
    const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : 0
    const checkoutGraceMs = 45 * 60 * 1000
    if (createdAt && Date.now() - createdAt < checkoutGraceMs) continue

    await RecordModel.findByIdAndUpdate(refId, {
      $set: { isDeleted: true, deletedAt: new Date() },
    })
    unset[field] = 1
    product[field] = undefined
  }

  if (Object.keys(unset).length) {
    await AssetModel.findByIdAndUpdate(product._id, { $unset: unset })
  }

  return product
}

/** Hide unpaid premium services in API responses (abandoned Clozer/Stripe attempts). */
export function sanitizeUnpaidPremiumServicesForClient(listing) {
  if (!listing || typeof listing !== 'object') return listing
  for (const field of ['technicalReport', 'video3DWalkthrough']) {
    const ref = listing[field]
    if (ref && typeof ref === 'object' && !isPremiumServiceRecordPaid(ref)) {
      delete listing[field]
    }
  }
  return listing
}

/** Clear unpaid DB refs and strip them from the listing payload for edit forms. */
export async function refreshListingPremiumFieldsForEdit(listing) {
  if (!listing) return listing
  const Model = modelForAssetType(listing.assetType)
  if (Model && listing._id) {
    await clearUnpaidPremiumOnListing(listing, Model, [
      'technicalReport',
      'video3DWalkthrough',
    ])
  }
  return sanitizeUnpaidPremiumServicesForClient(listing)
}
