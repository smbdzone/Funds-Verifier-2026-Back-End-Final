/** Minimum price (AED) before Public/Private is allowed. Must stay in sync with the frontend forms. */
export const LISTING_VISIBILITY_THRESHOLDS = {
  property: 5_000_000,
  car: 200_000,
  boat: 1_000_000,
  jewelry: 100_000,
}

export function resolveListingPrice(payload = {}) {
  const candidates = [payload.price, payload.priceFrom, payload.listingPrice]
  for (const value of candidates) {
    const amount = Number(value)
    if (Number.isFinite(amount) && amount > 0) return amount
  }
  return 0
}

export function AssetsListingsPricing({
  type,
  listing,
  price,
  priceFrom,
  listingPrice,
} = {}) {
  try {
    const normalizedType = String(type || '').toLowerCase()
    const threshold = LISTING_VISIBILITY_THRESHOLDS[normalizedType]
    const amount = resolveListingPrice({ price, priceFrom, listingPrice })
    const nextListing = listing === 'Private' || listing === 'Public' ? listing : 'Public'

    if (threshold == null) return nextListing
    if (amount >= threshold) return nextListing
    return 'Public'
  } catch (error) {
    return 'Public'
  }
}

export function applyListingVisibility(type, body = {}, existing = {}) {
  const listing =
    body.listing !== undefined && body.listing !== ''
      ? body.listing
      : existing.listing || 'Public'
  return AssetsListingsPricing({
    type,
    listing,
    price: body.price ?? existing.price,
    priceFrom: body.priceFrom ?? existing.priceFrom,
    listingPrice: body.listingPrice ?? existing.listingPrice,
  })
}
