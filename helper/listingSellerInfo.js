import User from '../models/userModel.js'

/**
 * Listings reference their owner via `userUUID` (the `userId` ObjectId is
 * unset on many documents), so populating `userId` alone often yields nothing
 * and cards end up without the seller's avatar. This helper batch-loads the
 * owners by uuid so controllers can fill sellerAvatar/sellerName reliably.
 *
 * Returns a Map of userUUID -> seller fields.
 */
export const getListingSellersByUuid = async (listings) => {
  const items = Array.isArray(listings) ? listings : [listings]
  const uuids = [
    ...new Set(
      items
        .map((item) => item?.userUUID)
        .filter((uuid) => typeof uuid === 'string' && uuid),
    ),
  ]
  if (!uuids.length) return new Map()
  try {
    const users = await User.find({ uuid: { $in: uuids } })
      .select(
        'profileImage name lastname uuid email phone phoneNumber mobile emiratesId',
      )
      .lean()
    return new Map(users.map((u) => [u.uuid, u]))
  } catch {
    return new Map()
  }
}

/**
 * Unique per-user reference number shown on all of a seller's listings.
 * Derived from the first 8 chars of the user's uuid (assigned at signup,
 * including UAE Pass signups), so every user automatically has one.
 */
export const getSellerRef = (seller) => {
  const uuid = seller?.uuid
  if (typeof uuid !== 'string' || !uuid) return ''
  return uuid.slice(0, 8).toUpperCase()
}

/** Owner object for one listing: populated userId first, uuid lookup fallback. */
export const resolveListingSeller = (listing, sellersByUuid) => {
  const populated = listing?.userId
  if (
    populated &&
    typeof populated === 'object' &&
    (populated.profileImage !== undefined ||
      populated.name !== undefined ||
      populated.email !== undefined)
  ) {
    return populated
  }
  if (listing?.userUUID && sellersByUuid?.has(listing.userUUID)) {
    return sellersByUuid.get(listing.userUUID)
  }
  return null
}

/**
 * Attach seller contact fields used by evaluator evaluate forms and listing cards.
 * Safe for both public and privileged single-listing responses.
 */
export const attachListingSellerContact = async (listing) => {
  if (!listing || typeof listing !== 'object') return listing

  const sellersByUuid = await getListingSellersByUuid([listing])
  const seller = resolveListingSeller(listing, sellersByUuid)
  if (!seller) return listing

  const sellerPhone =
    seller.phoneNumber || seller.phone || seller.mobile || ''

  listing.sellerAvatar = seller.profileImage || listing.sellerAvatar || ''
  listing.sellerName = seller.name || listing.sellerName || ''
  listing.sellerEmail = seller.email || listing.sellerEmail || ''
  listing.sellerRef = getSellerRef(seller) || listing.sellerRef || ''

  const existingUser =
    listing.userId && typeof listing.userId === 'object' ? listing.userId : {}

  listing.userId = {
    ...existingUser,
    profileImage: existingUser.profileImage || seller.profileImage || '',
    name: existingUser.name || seller.name || '',
    lastname: existingUser.lastname || seller.lastname || '',
    email: existingUser.email || seller.email || '',
    phoneNumber:
      existingUser.phoneNumber || existingUser.phone || sellerPhone || '',
    phone: existingUser.phone || seller.phone || sellerPhone || '',
    uuid: existingUser.uuid || seller.uuid || '',
    emiratesId: existingUser.emiratesId || seller.emiratesId || undefined,
  }

  // Listing phone is the primary contact on evaluate forms.
  if (
    (listing.phoneNumber == null || listing.phoneNumber === '') &&
    sellerPhone
  ) {
    listing.phoneNumber = sellerPhone
  }

  return listing
}
