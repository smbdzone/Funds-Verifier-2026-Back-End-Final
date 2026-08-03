import Property from '../models/propertyModel.js'

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

  if (unit.listingPrice != null && unit.listingPrice !== '') {
    const price = Number(unit.listingPrice)
    if (Number.isFinite(price) && price > 0) {
      updates.price = price
      updates.priceFrom = price
      updates.priceTo = price
    }
  }

  if (unit.builtUpArea != null && unit.builtUpArea !== '') {
    const bua = Number(unit.builtUpArea)
    if (Number.isFinite(bua)) {
      updates.sizeSQFT = bua
      updates.sizeSQFTFrom = bua
      updates.sizeSQFTTo = bua
      updates.sizeUnit = 'SQFT'
    }
  }

  if (unit.bedrooms != null && unit.bedrooms !== '') {
    updates.bedrooms = Number(unit.bedrooms)
  }
  if (unit.bathrooms != null && unit.bathrooms !== '') {
    updates.bathrooms = Number(unit.bathrooms)
  }

  if (unit.unitNumber) {
    // Keep title in sync when unit number changes (prefix kept short for maxlength 50).
    const existing = await Property.findById(unit.publishedPropertyId)
      .select('title')
      .lean()
    if (existing?.title) {
      const title = String(existing.title)
      const updatedTitle = title.includes('— Unit')
        ? `${title.split('— Unit')[0].trim()} — Unit ${unit.unitNumber}`.slice(0, 50)
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
