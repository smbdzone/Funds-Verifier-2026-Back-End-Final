import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import { sanitizeUUID } from './nosqlSanitizer.js'

const ASSET_MODELS = {
  property: Property,
  car: Car,
  jewelry: Jewelry,
  jewellery: Jewelry,
  boat: Boat,
}

function modelForAssetType(assetType) {
  if (!assetType || typeof assetType !== 'string') return null
  const normalized = assetType.toLowerCase()
  if (normalized.includes('property')) return Property
  if (normalized.includes('car')) return Car
  if (normalized.includes('jewel')) return Jewelry
  if (normalized.includes('boat')) return Boat
  return null
}

/**
 * Premium services (3D / technical report) require evaluator approval first.
 */
export async function assertListingApprovedForPremium({
  productUUID,
  productId,
  assetType,
}) {
  const uuid = sanitizeUUID(productUUID)
  const Model =
    modelForAssetType(assetType) ||
    (uuid || productId ? Property : null)

  if (!Model) {
    return { ok: false, status: 400, message: 'Unknown asset type' }
  }

  let listing = null
  if (uuid) {
    listing = await Model.findOne({ uuid, isDeleted: { $ne: true } })
  } else if (productId) {
    listing = await Model.findById(productId)
  }

  if (!listing) {
    return { ok: false, status: 404, message: 'Listing not found' }
  }

  const approved =
    Number(listing.status) === 1 && !!listing.evaluationCertificate

  if (!approved) {
    return {
      ok: false,
      status: 403,
      message:
        '3D walkthrough and technical report can only be requested after evaluator approval.',
    }
  }

  return { ok: true, listing }
}
