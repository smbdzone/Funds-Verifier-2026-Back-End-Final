/**
 * After evaluator approval, asset holders may only change listing price,
 * Public/Private visibility, and premium-service requests — not the
 * evaluator-finalized property details.
 */

function isOffPlanAssetType(assetType = '') {
  return String(assetType).toLowerCase().includes('off plan')
}

export function isListingEvaluatorApproved(listing) {
  if (!listing) return false
  if (Number(listing.status) !== 1) return false
  if (isOffPlanAssetType(listing.assetType)) return true
  return Boolean(listing.evaluationCertificate)
}

const ASSET_HOLDER_ALLOWED_AFTER_APPROVAL = new Set([
  'price',
  'priceFrom',
  'priceTo',
  'listing',
  'video',
  'video3DWalkthrough',
  'technicalReport',
  'uploadDocument',
  'fulfillRequestDocument',
  'customerId',
  'paymentMethod',
  'payment_provider',
  'clozer_transaction_id',
  'checkoutSession',
  'checkout_session',
  'evaluationDateTime',
  'evaluatorUUID',
])

/**
 * Strip locked fields from an asset-holder update after evaluator approval.
 * Privileged roles (Evaluator / Admin / etc.) are left untouched.
 */
export function restrictAssetHolderBodyAfterApproval(product, body, user) {
  if (!body || typeof body !== 'object') return body

  const role = String(user?.role || '').toLowerCase()
  if (role !== 'assetholder') return body
  if (!isListingEvaluatorApproved(product)) return body

  const ownerUuid = product?.userUUID
  const requesterUuid = user?.uuid
  if (
    ownerUuid &&
    requesterUuid &&
    String(ownerUuid) !== String(requesterUuid)
  ) {
    return body
  }

  const allowed = {}
  for (const key of Object.keys(body)) {
    if (ASSET_HOLDER_ALLOWED_AFTER_APPROVAL.has(key)) {
      allowed[key] = body[key]
    }
  }
  return allowed
}
