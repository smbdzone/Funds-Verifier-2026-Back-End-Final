import { modelForAssetType } from './listingPremiumSync.js'
import { refreshListingMediaSignedUrls } from '../helper/refreshAssetSignedUrls.js'

/** Long enough for recipients to open the approval email later. */
const EMAIL_IMAGE_EXPIRY_SECONDS = 7 * 24 * 60 * 60

function pickHttpImageUrl(images) {
  if (!Array.isArray(images)) return ''
  for (const img of images) {
    if (!img || typeof img !== 'object') continue
    const signed = img.signedUrl
    if (typeof signed === 'string' && signed.startsWith('http')) return signed
    const url = img.url
    if (typeof url === 'string' && url.startsWith('http')) return url
  }
  return ''
}

function previewFromListingDoc(listing) {
  if (!listing || typeof listing !== 'object') return ''
  return (
    pickHttpImageUrl(listing?.thumbnailImg?.images) ||
    pickHttpImageUrl(listing?.pictures?.images) ||
    ''
  )
}

/**
 * Best listing image URL for approval / event emails.
 * Re-fetches + re-signs when the notify payload only has ObjectId media refs.
 */
export async function resolveListingEmailPreviewUrl(listing, assetType) {
  try {
    const existing = previewFromListingDoc(listing)
    if (existing) return existing

    const Model = modelForAssetType(assetType || listing?.assetType)
    if (!Model || !listing) return ''

    const query = listing.uuid
      ? { uuid: listing.uuid, isDeleted: { $ne: true } }
      : listing._id
        ? { _id: listing._id, isDeleted: { $ne: true } }
        : null
    if (!query) return ''

    const doc = await Model.findOne(query)
      .select('thumbnailImg pictures assetType title')
      .populate({ path: 'thumbnailImg', select: 'images' })
      .populate({ path: 'pictures', select: 'images' })

    if (!doc) return ''

    await refreshListingMediaSignedUrls(doc, EMAIL_IMAGE_EXPIRY_SECONDS)
    return previewFromListingDoc(doc)
  } catch (error) {
    console.warn(
      'resolveListingEmailPreviewUrl failed:',
      error?.message || error,
    )
    return ''
  }
}
