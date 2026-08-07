import mongoose from 'mongoose'
import {
  applyListingStatusFilters,
  getSafeStringParam,
} from './listingQuery.js'
import {
  applyCardListPopulates,
  computeCardRatingFields,
} from './listingCardQuery.js'
import { refreshListingsMediaSignedUrls } from '../helper/refreshAssetSignedUrls.js'
import { sanitizeListingsMediaResponse } from '../helper/sanitizeListingResponse.js'

const DEFAULT_RELATED_LIMIT = 12
const MAX_RELATED_LIMIT = 24

function parseRelatedLimit(query) {
  const raw = Number(query?.limit)
  if (!Number.isFinite(raw)) return DEFAULT_RELATED_LIMIT
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_RELATED_LIMIT)
}

function buildExcludeClauses(query) {
  const clauses = []

  const excludeUuid = getSafeStringParam(query, 'excludeUuid')
  if (excludeUuid) {
    clauses.push({ uuid: { $ne: excludeUuid } })
  }

  const excludeSlug = getSafeStringParam(query, 'excludeSlug')
  if (excludeSlug) {
    clauses.push({ slug: { $ne: excludeSlug } })
  }

  const excludeId = getSafeStringParam(query, 'excludeId')
  if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
    clauses.push({ _id: { $ne: new mongoose.Types.ObjectId(excludeId) } })
  }

  return clauses
}

/**
 * Lightweight related listings for detail-page carousels.
 * Public + approved by default, card projection, hard limit, current excluded.
 */
export async function findRelatedListings({
  Model,
  cardFields,
  query = {},
  softFields = [],
}) {
  const limit = parseRelatedLimit(query)
  const match = {
    isDeleted: false,
    listing: 'Public',
  }

  applyListingStatusFilters(match, query)
  if (match.status === undefined) {
    match.status = 1
  }

  for (const field of softFields) {
    const value = getSafeStringParam(query, field)
    if (value) {
      match[field] = value
    }
  }

  const and = buildExcludeClauses(query)

  if (
    String(query.excludeOffPlan || '').toLowerCase() === 'true' ||
    String(query.excludeOffPlan || '') === '1'
  ) {
    and.push({
      assetType: { $not: /off\s*plan/i },
    })
  }

  if (and.length) {
    match.$and = and
  }

  let dbQuery = Model.find(match).select(cardFields)
  dbQuery = applyCardListPopulates(dbQuery)
  dbQuery = dbQuery.sort('-createdAt').limit(limit)

  const products = await dbQuery
  await refreshListingsMediaSignedUrls(products)
  sanitizeListingsMediaResponse(products)

  const finalProducts = products.map((product) => {
    const obj =
      typeof product.toObject === 'function' ? product.toObject() : product
    const { reviewCount, averageRating } = computeCardRatingFields(obj)
    obj.reviewCount = reviewCount
    obj.averageRating = averageRating
    delete obj.uploadDocument
    delete obj.invoice
    delete obj.agencyAgreement
    return obj
  })

  return {
    total: finalProducts.length,
    products: finalProducts,
  }
}
