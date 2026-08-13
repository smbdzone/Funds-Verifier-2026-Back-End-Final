/**
 * Slim list projections for marketplace / home cards.
 * Cards need identity, price, location, media thumbs (+ listing video),
 * ratings, and premium refs for badges — not layout PDFs or reviews.
 */

export const CARD_PROPERTY_FIELDS = `
  uuid
  slug
  title
  price
  priceFrom
  priceTo
  evaluationPrices
  roi
  assetType
  propertyType
  propertyForSale
  propertyForLease
  listing
  status
  underProcess
  country
  city
  neighbourhood
  bedrooms
  bathrooms
  developer
  sizeSQFT
  sizeSQM
  sizeUnit
  sizeType
  sizeSQFTFrom
  sizeSQFTTo
  sizeSQMFrom
  sizeSQMTo
  deliveryQuarter
  deliveryYear
  paymentPlanType
  layout
  numberOfFloors
  availableApartment
  isFurnished
  occupancyStatus
  thumbnailImg
  pictures
  video
  qrScan
  userId
  userUUID
  evaluationCertificate
  technicalReport
  video3DWalkthrough
  analytics
  ratings
  totalrating
  createdAt
  advertisementId
  dldNumber
  leaseNumberofCheques
`

export const CARD_CAR_FIELDS = `
  uuid
  slug
  title
  price
  evaluationPrices
  assetType
  make
  model
  category
  carType
  year
  kilometers
  country
  city
  neighbourhood
  status
  underProcess
  listing
  thumbnailImg
  pictures
  video
  qrScan
  userId
  userUUID
  evaluationCertificate
  technicalReport
  video3DWalkthrough
  analytics
  ratings
  totalrating
  createdAt
  dldNumber
`

export const CARD_BOAT_FIELDS = `
  uuid
  slug
  title
  price
  evaluationPrices
  assetType
  category
  model
  condition
  length
  country
  city
  neighbourhood
  locateBoat
  status
  underProcess
  listing
  thumbnailImg
  pictures
  video
  qrScan
  userId
  userUUID
  evaluationCertificate
  technicalReport
  video3DWalkthrough
  analytics
  ratings
  totalrating
  createdAt
  dldNumber
`

export const CARD_JEWELRY_FIELDS = `
  uuid
  slug
  title
  price
  evaluationPrices
  assetType
  category
  condition
  grams
  country
  city
  neighbourhood
  locateJewelry
  status
  underProcess
  listing
  thumbnailImg
  pictures
  video
  qrScan
  userId
  userUUID
  evaluationCertificate
  technicalReport
  video3DWalkthrough
  analytics
  ratings
  totalrating
  createdAt
  dldNumber
`

const MEDIA_SELECT = 'images uuid -_id'
const VIDEO_SELECT = 'videos uuid -_id'
const CERT_SELECT = '_id uuid status payment_method_status'
const WALKTHROUGH_SELECT = '_id uuid status payment_method_status link'
const REPORT_SELECT = '_id uuid status payment_method_status IsRecommended'

/**
 * Use card projection for marketplace/home lists.
 * Keep full payloads for dashboards and evaluator/admin moderation.
 */
export function shouldUseCardListProjection(req, isAuthenticated) {
  const view = String(req.query?.view || '').toLowerCase()
  if (view === 'full') return false
  if (view === 'card') return true
  if (String(req.query?.dashboard || '') === 'true') return false

  if (!isAuthenticated) return true

  const role = String(req.user?.role || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  if (
    ['evaluator', 'subevaluator', 'admin', 'trustee', 'superadmin'].includes(
      role,
    )
  ) {
    return false
  }

  return true
}

/** Populate only media / badge refs needed on listing cards. */
export function applyCardListPopulates(query) {
  return query
    .populate({ path: 'thumbnailImg', select: MEDIA_SELECT })
    .populate({ path: 'pictures', select: MEDIA_SELECT })
    .populate({ path: 'video', select: VIDEO_SELECT })
    .populate({ path: 'qrScan', select: MEDIA_SELECT })
    .populate({ path: 'userId', select: 'profileImage name uuid' })
    .populate({ path: 'evaluationCertificate', select: CERT_SELECT })
    .populate({ path: 'video3DWalkthrough', select: WALKTHROUGH_SELECT })
    .populate({ path: 'technicalReport', select: REPORT_SELECT })
}

/**
 * Derive star rating for cards without populating the full reviews collection.
 */
export function computeCardRatingFields(obj = {}) {
  if (
    Number.isFinite(Number(obj.averageRating)) &&
    obj.reviewCount != null &&
    obj.reviewCount !== ''
  ) {
    return {
      averageRating: Number(obj.averageRating) || 0,
      reviewCount: Number(obj.reviewCount) || 0,
    }
  }

  const ratings = Array.isArray(obj.ratings) ? obj.ratings : []
  const reviewCount =
    Number(obj.reviewCounts) ||
    Number(obj.reviewCount) ||
    ratings.length ||
    0

  let averageRating = Number(obj.totalrating) || 0
  if ((!averageRating || Number.isNaN(averageRating)) && ratings.length) {
    const sum = ratings.reduce(
      (acc, row) => acc + Number(row?.star ?? row?.ratingNumber ?? 0),
      0,
    )
    averageRating = sum / ratings.length
  }

  return {
    averageRating: Number.isFinite(averageRating) ? averageRating : 0,
    reviewCount,
  }
}
