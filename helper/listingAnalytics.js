/**
 * Fire-and-forget visibility counters for listings.
 * - impressions / clicks: incremented only when a visitor opens that listing’s
 *   detail page (not when it appears in a browse/list response with others).
 * Only public (non-owner) traffic is counted; failures are silently ignored so
 * analytics never break a read request.
 */

/** @deprecated Bulk list impressions inflate every card on page load — do not use. */
export const recordListingImpressions = (_Model, _listings) => {
  // Intentionally no-op: views must be per-listing open, not browse grids.
}

export const recordListingClick = (Model, listing) => {
  if (!listing?.uuid) return
  Model.updateOne(
    { uuid: listing.uuid },
    { $inc: { 'analytics.clicks': 1, 'analytics.impressions': 1 } },
  ).catch(() => { })
}
