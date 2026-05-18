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
