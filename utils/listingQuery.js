import { escapeRegex as escapeRegexString } from './nosqlSanitizer.js'

/** Allowed query keys on listing read endpoints (GET /, /filter, /related-*, etc.). */
export const LISTING_QUERY_PARAMS = new Set([
  'page',
  'limit',
  'sort',
  'fields',
  'date',
  'minPrice',
  'maxPrice',
  'roi',
  'statusFilter',
  'status',
  'title',
  'dashboard',
  'token',
  'assetType',
  'country',
  'city',
  'neighbourhood',
  'propertyType',
  'propertyForSale',
  'propertyForLease',
  'facilities',
  'allFacilities',
  'bedrooms',
  'make',
  'model',
  'brands',
  'interiorColor',
  'exteriorColor',
  'technicalFeatures',
  'extras',
  'materials',
  'grams',
  'allextras',
  'allExteriorColor',
  'allinteriorColor',
  'allTechnicalFeatures',
  'allMaterials',
  'price',
  'evaluationPrices',
  'transactionStatus',
  'evaluatorPending',
])

/** Apply admin/listing status filters from query string onto a Mongo filter object. */
export function applyListingStatusFilters(parseData, query) {
  if (query?.statusFilter === '1' || query?.status === '1') {
    parseData.status = 1
  } else if (query?.statusFilter === '0' || query?.status === '0') {
    parseData.status = 0
  }

  const transactionStatus = getSafeStringParam(query, 'transactionStatus')
  if (transactionStatus) {
    parseData.transactionStatus = transactionStatus.toLowerCase()
  }
}

/** Evaluator dashboards: submitted listings awaiting evaluation (paid + booked slot). */
export function applyEvaluatorPendingFilter(parseData, query) {
  if (query?.evaluatorPending !== 'true') return
  parseData.status = 0
  parseData.evaluationDateTime = { $exists: true, $ne: null }
}

/** Scalar filter fields copied as plain equality matches on list endpoints. */
export const LISTING_FILTER_FIELDS = new Set([
  'assetType',
  'country',
  'city',
  'neighbourhood',
  'propertyType',
  'propertyForSale',
  'propertyForLease',
  'make',
  'model',
  'brands',
  'bedrooms',
  'grams',
  'interiorColor',
  'exteriorColor',
  'technicalFeatures',
  'extras',
  'materials',
])

export function isScalarQueryValue(value) {
  return (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

export function validateListingQuery(query) {
  if (!query || typeof query !== 'object') {
    return { ok: true }
  }

  for (const [key, value] of Object.entries(query)) {
    if (
      key.includes('[') ||
      key.includes(']') ||
      key.startsWith('$') ||
      key.includes('.')
    ) {
      return { ok: false, message: 'Invalid query parameter' }
    }

    if (!LISTING_QUERY_PARAMS.has(key)) {
      return { ok: false, message: 'Invalid query parameter' }
    }

    if (!isScalarQueryValue(value)) {
      return { ok: false, message: 'Invalid query parameter' }
    }
  }

  return { ok: true }
}

export function getSafeStringParam(query, key) {
  const value = query?.[key]
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return null
  }
  return String(value).trim()
}

export function getSafeTitleRegex(query) {
  const title = getSafeStringParam(query, 'title')
  if (!title) {
    return null
  }
  return { $regex: escapeRegexString(title), $options: 'i' }
}

export function pickScalarFilters(query, allowedFields = LISTING_FILTER_FIELDS) {
  const filters = {}
  for (const field of allowedFields) {
    const val = getSafeStringParam(query, field)
    if (val) {
      filters[field] = val
    }
  }
  return filters
}

const ROI_BRACKET_TOLERANCE_PERCENT = 20

/** Filter listings within ±20% of the target ROI (e.g. roi=5 → 4–6). */
export function applyRoiRangeFilter(parseData, query) {
  const roiRaw = query?.roi
  if (roiRaw === undefined || roiRaw === null || roiRaw === '') return

  const center = Number(roiRaw)
  if (!Number.isFinite(center) || center < 0) return

  const delta = (center * ROI_BRACKET_TOLERANCE_PERCENT) / 100
  parseData.roi = {
    $gte: Math.max(0, center - delta),
    $lte: center + delta,
  }
}

export { escapeRegexString as escapeRegex }
