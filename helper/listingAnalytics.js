/**
 * Fire-and-forget visibility counters for listings.
 * - impressions: how many times a listing was shown on public browse/card pages
 * - clicks: how many times a visitor opened the listing detail page
 * Only public (non-owner) traffic is counted; failures are silently ignored so
 * analytics never break a read request.
 */

export const recordListingImpressions = (Model, listings) => {
  const uuids = (Array.isArray(listings) ? listings : [])
    .map((listing) => listing?.uuid)
    .filter(Boolean)
  if (!uuids.length) return
  Model.updateMany(
    { uuid: { $in: uuids } },
    { $inc: { 'analytics.impressions': 1 } },
  ).catch(() => { })
}

export const recordListingClick = (Model, listing) => {
  if (!listing?.uuid) return
  Model.updateOne(
    { uuid: listing.uuid },
    { $inc: { 'analytics.clicks': 1 } },
  ).catch(() => { })
}
