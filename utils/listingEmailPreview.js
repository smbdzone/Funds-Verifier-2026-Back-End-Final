import { modelForAssetType } from './listingPremiumSync.js'
import { refreshListingMediaSignedUrls } from '../helper/refreshAssetSignedUrls.js'

/** Long enough for recipients to open the approval email later. */
const EMAIL_IMAGE_EXPIRY_SECONDS = 7 * 24 * 60 * 60

function pickHttpImageUrl(images) {
  if (!Array.isArray(images)) return ''
  for (const img of images) {
    if (!img || typeof img !== 'object') continue
    const signed = img.signedUrl
    if (typeof signed === 'string' && /^https?:\/\//i.test(signed.trim())) {
      return signed.trim()
    }
    const url = img.url
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      return url.trim()
    }
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
 * Escape URL for use inside an HTML attribute (email clients truncate at bare `&`).
 */
export function escapeEmailAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
}

/**
 * Responsive listing thumbnail block for HTML emails (mobile / tablet / desktop).
 */
export function buildEmailPreviewImageHtml(previewImageUrl, safeUrlFn) {
  if (!previewImageUrl || typeof previewImageUrl !== 'string') return ''
  const raw = previewImageUrl.trim()
  if (!raw) return ''

  const checked =
    typeof safeUrlFn === 'function' ? safeUrlFn(raw) : raw.startsWith('http') ? raw : '#'
  if (!checked || checked === '#') return ''

  const src = escapeEmailAttr(checked)

  // Table-based, full-bleed hero: works in Outlook, Gmail, Apple Mail, mobile.
  return `
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0;border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:0;line-height:0;font-size:0;">
      <!--[if mso]>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560"><tr><td>
      <![endif]-->
      <img
        src="${src}"
        alt="Listing photo"
        width="560"
        border="0"
        style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
      />
      <!--[if mso]>
      </td></tr></table>
      <![endif]-->
    </td>
  </tr>
</table>`
}

/**
 * Best listing image URL for approval / event emails.
 * Always re-fetches + re-signs with a long expiry (do not reuse short API signedUrls).
 */
export async function resolveListingEmailPreviewUrl(listing, assetType) {
  try {
    const Model = modelForAssetType(assetType || listing?.assetType)
    if (!Model || !listing) {
      return previewFromListingDoc(listing)
    }

    const query = listing.uuid
      ? { uuid: listing.uuid, isDeleted: { $ne: true } }
      : listing._id
        ? { _id: listing._id, isDeleted: { $ne: true } }
        : null
    if (!query) return previewFromListingDoc(listing)

    const doc = await Model.findOne(query)
      .select('thumbnailImg pictures assetType title')
      .populate({ path: 'thumbnailImg', select: 'images' })
      .populate({ path: 'pictures', select: 'images' })

    if (!doc) return previewFromListingDoc(listing)

    await refreshListingMediaSignedUrls(doc, EMAIL_IMAGE_EXPIRY_SECONDS, {
      force: true,
    })
    return previewFromListingDoc(doc) || previewFromListingDoc(listing)
  } catch (error) {
    console.warn(
      'resolveListingEmailPreviewUrl failed:',
      error?.message || error,
    )
    return previewFromListingDoc(listing)
  }
}
