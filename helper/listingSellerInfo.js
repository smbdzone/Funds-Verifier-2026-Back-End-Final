import User from '../models/userModel.js'

/**
 * Listings reference their owner via `userUUID` (the `userId` ObjectId is
 * unset on many documents), so populating `userId` alone often yields nothing
 * and cards end up without the seller's avatar. This helper batch-loads the
 * owners by uuid so controllers can fill sellerAvatar/sellerName reliably.
 *
 * Returns a Map of userUUID -> { profileImage, name, uuid }.
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
      .select('profileImage name uuid email phoneNumber phone mobile')
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
    (populated.profileImage !== undefined || populated.name !== undefined)
  ) {
    return populated
  }
  if (listing?.userUUID && sellersByUuid?.has(listing.userUUID)) {
    return sellersByUuid.get(listing.userUUID)
  }
  return null
}
