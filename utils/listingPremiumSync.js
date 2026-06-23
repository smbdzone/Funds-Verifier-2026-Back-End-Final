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

/** Do not let PUT /property wipe premium refs when body sends null (legacy frontend). */
export function stripNullPremiumRefs(body) {
  if (!body || typeof body !== 'object') return body
  for (const key of [
    'technicalReport',
    'video3DWalkthrough',
    'evaluationCertificate',
  ]) {
    if (body[key] === null || body[key] === '') {
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
  await Model.updateOne(query, { $set: { technicalReport: report._id } })
}

/** Keep listing → video3DWalkthrough ObjectId in sync. */
export async function linkWalkthroughToListing(request) {
  if (!request?._id) return
  const Model = modelForAssetType(request.assetType)
  const query = listingQueryFromPremiumRecord(request)
  if (!Model || !query) return
  await Model.updateOne(query, { $set: { video3DWalkthrough: request._id } })
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

const PAID_PAYMENT_STATUSES = new Set(['paid', 'succeeded'])
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
