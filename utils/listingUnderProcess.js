import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import Booking from '../models/Booking.js'

export const BOOKING_VIEWING_STATUSES = ['open', 'under_process']

export function getAssetModelByType(assetType = '') {
  const type = String(assetType).toLowerCase()
  if (type.includes('car')) return Car
  if (type.includes('property')) return Property
  if (type.includes('jewel')) return Jewelry
  if (type.includes('boat')) return Boat
  return Property
}

export function normalizeBookingViewingStatus(status) {
  const normalized = String(status || 'open').trim().toLowerCase()
  return normalized === 'under_process' ? 'under_process' : 'open'
}

export function isBookingUnderProcess(status) {
  return normalizeBookingViewingStatus(status) === 'under_process'
}

/** Prevent sellers from changing price while trustee marked buyer-in-talks. */
export function blockPriceChangeIfUnderProcess(product, body) {
  if (!product?.underProcess) return null
  if (body?.price === undefined || body?.price === null || body?.price === '') {
    return null
  }

  const nextPrice = Number(body.price)
  const currentPrice = Number(product.price)
  if (!Number.isFinite(nextPrice) || nextPrice === currentPrice) return null

  return 'Price cannot be changed while a buyer is in talks for this asset.'
}

export function stripUnderProcessFromListingPayload(body = {}) {
  if (!body || typeof body !== 'object') return body
  delete body.underProcess
  return body
}

export async function syncListingUnderProcessFlag(assetType, assetUuid) {
  if (!assetUuid) return

  const AssetModel = getAssetModelByType(assetType)
  const stillUnderProcess = await Booking.exists({
    isDeleted: false,
    'productData.uuid': assetUuid,
    status: 'under_process',
  })

  await AssetModel.updateOne(
    { uuid: assetUuid, isDeleted: false },
    { underProcess: Boolean(stillUnderProcess) },
  )
}
