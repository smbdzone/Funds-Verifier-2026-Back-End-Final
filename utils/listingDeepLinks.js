/**
 * Dashboard deep-link paths for email CTAs (relative paths).
 * Pair with FRONTEND_URL on the server. FV portal emails should not use these.
 */

function frontendBase() {
  return String(process.env.FRONTEND_URL || 'https://fundsverifier.com').replace(
    /\/$/,
    '',
  )
}

export function absoluteFrontendUrl(path) {
  if (!path) return frontendBase()
  if (/^https?:\/\//i.test(path)) return path
  return `${frontendBase()}${path.startsWith('/') ? path : `/${path}`}`
}

function normalizeAssetKey(assetType) {
  const t = String(assetType || '').toLowerCase()
  if (t.includes('car')) return 'car'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewelry'
  if (t.includes('off plan')) return 'offplan'
  return 'property'
}

/** Evaluator / sub-evaluator detail page for a listing UUID. */
export function getEvaluatorListingPath(assetType, listingUuid, role) {
  if (!listingUuid) {
    return String(role || '').toLowerCase().includes('sub')
      ? '/sub-evaluator-profile'
      : '/evaluator-profile'
  }

  const key = normalizeAssetKey(assetType)
  const isSub = String(role || '')
    .toLowerCase()
    .replace(/[\s-_]/g, '')
    .includes('subevaluator')

  if (isSub) {
    if (key === 'car') return `/sub-evaluator-profile/car-evaluation/${listingUuid}`
    if (key === 'boat') return `/sub-evaluator-profile/boat-evaluation/${listingUuid}`
    if (key === 'jewelry') {
      return `/sub-evaluator-profile/jewelry-evaluation/${listingUuid}`
    }
    return `/sub-evaluator-profile/property-evaluation/${listingUuid}`
  }

  if (key === 'car') return `/evaluator-profile/cars-evaluation/${listingUuid}`
  if (key === 'boat') return `/evaluator-profile/boat-evaluation/${listingUuid}`
  if (key === 'jewelry') {
    return `/evaluator-profile/jewellery-evaluation/${listingUuid}`
  }
  return `/evaluator-profile/property-evaluation/${listingUuid}`
}

/** Asset holder edit listing page (dashboard) — keep for edit/service flows. */
export function getAssetHolderListingPath(assetType, listingUuid) {
  if (!listingUuid) return '/seller-profile/my-listing'

  const key = normalizeAssetKey(assetType)
  if (key === 'car') return `/dashboard/car-listing?id=${listingUuid}`
  if (key === 'boat') return `/dashboard/boat-listing?id=${listingUuid}`
  if (key === 'jewelry') return `/dashboard/jewelry-listing?id=${listingUuid}`
  return `/dashboard/property-listing?id=${listingUuid}`
}

/**
 * Public marketplace detail page (buyer-facing frontend).
 * Prefer slug; fall back to uuid so the link still opens after approval.
 */
export function getPublicListingPath(listing = {}, assetType) {
  const key = normalizeAssetKey(assetType || listing?.assetType)
  const id = listing?.slug || listing?.uuid || listing?._id
  if (!id) return '/'

  if (key === 'offplan') return `/offplan/${id}`
  if (key === 'car') return `/car/${id}`
  if (key === 'boat') return `/boat/${id}`
  if (key === 'jewelry') return `/jewelry/${id}`
  return `/property/${id}`
}

/** Pending evaluation view for asset holder. */
export function getAssetHolderPendingEvaluationPath(assetType, listingUuid) {
  if (!listingUuid) return '/seller-profile/pending-evaluation'
  return `/seller-profile/pending-evaluation/${listingUuid}?assetType=${encodeURIComponent(assetType || '')}`
}

/** Technical report provider request detail. */
export function getTechnicalReportRequestPath(requestUuid) {
  if (!requestUuid) return '/survey-dashboard/requested-reports'
  return `/survey-dashboard/technical-report?id=${requestUuid}`
}

/** 3D walkthrough provider request detail. */
export function getWalkthroughRequestPath(requestUuid) {
  if (!requestUuid) return '/3d-walkthrough'
  return `/smb-details?id=${requestUuid}`
}
