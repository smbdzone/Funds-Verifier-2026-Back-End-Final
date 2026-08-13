import Property from '../models/propertyModel.js'
import { mapUnitSizeToPropertyFields } from './mapUnitSizeToProperty.js'

/**
 * Map developer unit inventory status onto the linked marketplace Property.
 * Does not touch escrow transactionStatus.
 */
export function mapUnitStatusToPropertyFields(unitStatus, { isDeleted = false } = {}) {
  if (isDeleted) {
    return {
      status: 0,
      underProcess: false,
      occupancyStatus: 'Unavailable',
    }
  }

  switch (unitStatus) {
    case 'Sold':
    case 'Draft':
    case 'Pending':
      return {
        status: 0,
        underProcess: false,
        occupancyStatus: unitStatus,
      }
    case 'Reserved':
    case 'Under Offer':
      return {
        status: 1,
        underProcess: true,
        occupancyStatus: unitStatus,
      }
    case 'Available':
    default:
      return {
        status: 1,
        underProcess: false,
        occupancyStatus: unitStatus || 'Available',
      }
  }
}

/**
 * Push live price / size / beds / status from DeveloperUnit → Property.
 * No-op when the unit was never published.
 */
export async function syncPublishedPropertyFromUnit(unit) {
  if (!unit?.publishedPropertyId) return null

  const updates = {
    ...mapUnitStatusToPropertyFields(unit.status, {
      isDeleted: Boolean(unit.isDeleted),
    }),
  }

  const priceFrom = Number(unit.priceFrom ?? unit.listingPrice)
  const priceTo = Number(unit.priceTo ?? unit.priceFrom ?? unit.listingPrice)
  if (Number.isFinite(priceFrom) && priceFrom > 0) {
    updates.price = priceFrom
    updates.priceFrom = priceFrom
    updates.priceTo =
      Number.isFinite(priceTo) && priceTo > 0 ? priceTo : priceFrom
  }

  if (unit.title) {
    updates.title = String(unit.title).trim().slice(0, 60)
  }

  if (unit.video) updates.video = unit.video
  if (unit.thumbnailImg) updates.thumbnailImg = unit.thumbnailImg
  if (unit.pictures) updates.pictures = unit.pictures
  if (unit.qrScan) updates.qrScan = unit.qrScan

  if (unit.builtUpArea != null && unit.builtUpArea !== '') {
    const bua = Number(unit.builtUpArea)
    if (Number.isFinite(bua)) {
      Object.assign(updates, mapUnitSizeToPropertyFields(unit))
    }
  } else if (unit.sizeUnit) {
    updates.sizeUnit = unit.sizeUnit
  }

  if (unit.bedrooms != null && unit.bedrooms !== '') {
    updates.bedrooms = Number(unit.bedrooms)
  }
  if (unit.bathrooms != null && unit.bathrooms !== '') {
    updates.bathrooms = Number(unit.bathrooms)
  }

  if (unit.unitNumber) {
    // Keep title in sync when unit number changes (prefix kept short for maxlength 60).
    const existing = await Property.findById(unit.publishedPropertyId)
      .select('title')
      .lean()
    if (existing?.title) {
      const title = String(existing.title)
      const updatedTitle = title.includes('— Unit')
        ? `${title.split('— Unit')[0].trim()} — Unit ${unit.unitNumber}`.slice(0, 60)
        : title
      updates.title = updatedTitle
    }
  }

  return Property.findByIdAndUpdate(
    unit.publishedPropertyId,
    { $set: updates },
    { new: true },
  )
}
