import {
  LISTING_QUERY_PARAMS,
  applyRoiRangeFilter,
  getSafeStringParam,
} from './listingQuery.js'

const RESERVED_KEYS = new Set([
  'minPrice',
  'maxPrice',
  'roi',
  'page',
  'limit',
  'statusFilter',
  'token',
  'sort',
  'fields',
  'dashboard',
  'title',
  'date',
])

const FILTER_PASSTHROUGH = [...LISTING_QUERY_PARAMS].filter(
  (key) => !RESERVED_KEYS.has(key),
)

function processQuery(query) {
  const modifiedQuery = {}

  for (const key of FILTER_PASSTHROUGH) {
    const val = getSafeStringParam(query, key)
    if (val !== null) {
      modifiedQuery[key] = val
    }
  }

  const parsedMin = parseFloat(query?.minPrice)
  const parsedMax = parseFloat(query?.maxPrice)

  if (query?.minPrice !== undefined && !Number.isNaN(parsedMin)) {
    modifiedQuery.price = { ...(modifiedQuery.price || {}), $gte: parsedMin }
  }
  if (query?.maxPrice !== undefined && !Number.isNaN(parsedMax)) {
    modifiedQuery.price = { ...(modifiedQuery.price || {}), $lte: parsedMax }
  }

  applyRoiRangeFilter(modifiedQuery, query)

  return modifiedQuery
}

export default processQuery
