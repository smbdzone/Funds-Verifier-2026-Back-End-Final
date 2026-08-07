import asyncHandler from 'express-async-handler'
import {
  applyListingStatusFilters,
  escapeRegex,
  getSafeStringParam,
} from './listingQuery.js'

const MAX_LOCATION_COMBOS = 5000

/**
 * Build a lean country/city/neighbourhood facet match for marketplace filters.
 * Mirrors public list defaults: not deleted, Public listing, approved when
 * statusFilter is omitted (search/sidebar only need live catalog locations).
 */
export function buildListingLocationsMatch(query = {}) {
  const match = {
    isDeleted: false,
    listing: 'Public',
  }

  applyListingStatusFilters(match, query)
  if (match.status === undefined) {
    match.status = 1
  }

  const assetType = getSafeStringParam(query, 'assetType')
  if (assetType) {
    match.assetType = assetType
  }

  const propertyForSale = getSafeStringParam(query, 'propertyForSale')
  if (propertyForSale) {
    match.propertyForSale = {
      $regex: new RegExp(`^${escapeRegex(propertyForSale)}$`, 'i'),
    }
  }

  const propertyForLease = getSafeStringParam(query, 'propertyForLease')
  if (propertyForLease) {
    match.propertyForLease = {
      $regex: new RegExp(`^${escapeRegex(propertyForLease)}$`, 'i'),
    }
  }

  return match
}

/**
 * Distinct location rows only — no media, populate, or signing.
 * Response shape stays compatible with frontend buildCountry*Map helpers.
 */
export async function aggregateListingLocations(Model, query = {}) {
  const match = buildListingLocationsMatch(query)

  const rows = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          country: { $ifNull: ['$country', ''] },
          city: { $ifNull: ['$city', ''] },
          neighbourhood: { $ifNull: ['$neighbourhood', ''] },
        },
      },
    },
    { $limit: MAX_LOCATION_COMBOS },
  ])

  return rows
    .map((row) => ({
      country: String(row?._id?.country || '').trim(),
      city: String(row?._id?.city || '').trim(),
      neighbourhood: String(row?._id?.neighbourhood || '').trim(),
    }))
    .filter((row) => row.country && row.city)
}

/** Express handler factory for GET /:asset/locations */
export function createGetListingLocations(Model) {
  return asyncHandler(async (req, res) => {
    const locations = await aggregateListingLocations(Model, req.query)
    res.status(200).json({
      total: locations.length,
      locations,
    })
  })
}
