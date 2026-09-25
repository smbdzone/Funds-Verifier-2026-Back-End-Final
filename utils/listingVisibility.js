/** Marketplace browse includes approved Public and Private listings. */
export const MARKETPLACE_LISTING_FILTER = { $in: ['Public', 'Private'] }

export function applyMarketplaceListingFilter(parseData = {}) {
  parseData.listing = MARKETPLACE_LISTING_FILTER
  return parseData
}

export function isPrivateListing(listing) {
  return String(listing?.listing || '').trim() === 'Private'
}

function identityKeys(value) {
  if (value == null || value === '') return []
  if (typeof value === 'object') {
    return [value._id, value.id, value.uuid].filter(Boolean).map((v) => String(v))
  }
  return [String(value)]
}

export function isListingOwner(user, listing) {
  if (!user || !listing) return false
  const userIds = new Set(
    [user.uuid, user._id, user.id, user.userUUID]
      .filter(Boolean)
      .map((v) => String(v).trim()),
  )
  if (!userIds.size) return false

  const ownerIds = [
    listing.userUUID,
    listing.userUuid,
    ...identityKeys(listing.userId),
    ...identityKeys(listing.user),
  ]
    .filter(Boolean)
    .map((v) => String(v).trim())

  return ownerIds.some((id) => userIds.has(id))
}

const PRIVATE_UNLOCK_ROLES = new Set([
  'admin',
  'superadmin',
  'evaluator',
  'subevaluator',
  'trustee',
])

function filledFinanceField(value) {
  if (value == null || value === '') return false
  if (typeof value === 'object') {
    if (value._id || value.uuid || value.Certificate || value.id) return true
    const asString =
      typeof value.toString === 'function' ? String(value.toString()) : ''
    return Boolean(asString && asString !== '[object Object]')
  }
  return String(value).trim().length > 0
}

function parseMoneyAmount(value) {
  if (value == null || value === '') return NaN
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return NaN
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : NaN
}

export function getListingUnlockPrice(listing) {
  const from = parseMoneyAmount(listing?.priceFrom)
  const price = parseMoneyAmount(listing?.price)
  if (Number.isFinite(from) && from > 0) return from
  if (Number.isFinite(price) && price > 0) return price
  return 0
}

export function dealHunterCanViewPrivateListing(user, listing) {
  const roleKey = String(user?.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  if (roleKey !== 'dealhunter') return false

  const info = user?.financialInfo
  if (!info) return false
  if (String(info.status || '').trim() !== 'Approved') return false
  if (
    !filledFinanceField(info.verificationCertificate) ||
    !filledFinanceField(info.fundsVerification) ||
    !filledFinanceField(info.bankName) ||
    !filledFinanceField(info.bankBranch) ||
    !filledFinanceField(info.city) ||
    !filledFinanceField(info.country)
  ) {
    return false
  }

  const funds = parseMoneyAmount(info.fundsVerification)
  const listingPrice = getListingUnlockPrice(listing)
  if (!Number.isFinite(funds) || funds <= 0 || listingPrice <= 0) return false
  return funds >= listingPrice
}

export function canUnlockPrivateListing(user, listing) {
  if (!isPrivateListing(listing)) return true
  if (!user) return false
  if (isListingOwner(user, listing)) return true
  if (dealHunterCanViewPrivateListing(user, listing)) return true
  const roleKey = String(user.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  return PRIVATE_UNLOCK_ROLES.has(roleKey)
}

export function toLockedPrivateListingPayload(listing = {}) {
  return {
    uuid: listing.uuid,
    slug: listing.slug,
    title: listing.title,
    listing: 'Private',
    privateLocked: true,
    status: listing.status,
    assetType: listing.assetType,
    price: listing.price,
    priceFrom: listing.priceFrom,
    priceTo: listing.priceTo,
    country: listing.country,
    city: listing.city,
    neighbourhood: listing.neighbourhood,
    roi: listing.roi,
    propertyType: listing.propertyType,
    carType: listing.carType,
    make: listing.make,
    model: listing.model,
    brands: listing.brands,
    category: listing.category,
    boatType: listing.boatType,
    thumbnailImg: listing.thumbnailImg || null,
  }
}

/** Returns true when a locked payload was sent. */
export function sendLockedPrivateListingIfNeeded(res, user, listing) {
  if (canUnlockPrivateListing(user, listing)) return false
  res.json(toLockedPrivateListingPayload(listing))
  return true
}
