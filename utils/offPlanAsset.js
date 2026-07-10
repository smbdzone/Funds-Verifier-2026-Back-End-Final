/** True when asset type is an off-plan property listing. */
export function isOffPlanAssetType(assetType) {
  return String(assetType || '')
    .toLowerCase()
    .includes('off plan')
}

/** Off-plan listings are published immediately without evaluator approval. */
export function applyOffPlanAutoApproval(body) {
  if (!body || typeof body !== 'object') return body

  if (isOffPlanAssetType(body.assetType)) {
    body.status = 1
    body.evaluationStatus = 'approved'
    return body
  }

  // Non off-plan listings must stay pending until evaluator approval.
  body.status = 0
  return body
}
