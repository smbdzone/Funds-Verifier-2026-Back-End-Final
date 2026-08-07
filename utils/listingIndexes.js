/**
 * Shared compound indexes for marketplace listing collections.
 * Tuned for: isDeleted + Public + status + sort(-createdAt),
 * plus common filters (assetType, country/city) and seller dashboards.
 *
 * Prefer equality on `listing` ("Public"/"Private") — case-insensitive
 * regex on listing prevents these indexes from being used.
 */
export function applyMarketplaceListingIndexes(schema, options = {}) {
  const {
    includeSlug = true,
    includePropertyType = false,
    includeMake = false,
  } = options

  // Home / list / related: public approved feed sorted by newest.
  schema.index(
    { isDeleted: 1, listing: 1, status: 1, createdAt: -1 },
    { name: 'marketplace_feed' },
  )

  // Ready vs off-plan, jewelry category assetType, etc.
  schema.index(
    { isDeleted: 1, listing: 1, status: 1, assetType: 1, createdAt: -1 },
    { name: 'marketplace_by_asset_type' },
  )

  // Sidebar / search location facets and country+city filters.
  schema.index(
    { isDeleted: 1, listing: 1, status: 1, country: 1, city: 1 },
    { name: 'marketplace_by_location' },
  )

  // Asset-holder dashboard lists.
  schema.index(
    { userUUID: 1, isDeleted: 1, createdAt: -1 },
    { name: 'seller_dashboard' },
  )

  if (includeSlug) {
    schema.index({ slug: 1 }, { name: 'slug_lookup', sparse: true })
  }

  if (includePropertyType) {
    schema.index(
      {
        isDeleted: 1,
        listing: 1,
        status: 1,
        propertyType: 1,
        createdAt: -1,
      },
      { name: 'marketplace_by_property_type' },
    )
  }

  if (includeMake) {
    schema.index(
      { isDeleted: 1, listing: 1, status: 1, make: 1, createdAt: -1 },
      { name: 'marketplace_by_make' },
    )
  }
}
