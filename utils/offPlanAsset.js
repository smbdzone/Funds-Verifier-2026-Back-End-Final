/** True when asset type is an off-plan property listing. */
export function isOffPlanAssetType(assetType) {
  return String(assetType || '')
    .toLowerCase()
    .includes('off plan')
}

/**
 * Off-plan listings stay pending until Super Admin approval.
 * Regular listings stay pending until evaluator approval.
 */
export function applyOffPlanAutoApproval(body) {
  if (!body || typeof body !== 'object') return body

  body.status = 0
  if (isOffPlanAssetType(body.assetType)) {
    body.evaluationStatus = 'pending'
  }
  return body
}
