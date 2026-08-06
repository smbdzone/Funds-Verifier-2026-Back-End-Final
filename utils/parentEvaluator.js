export const getRequesterIdentityKeys = (requester) => {
  if (!requester) return []

  return Array.from(
    new Set(
      [requester._id, requester.uuid, requester.id]
        .filter(Boolean)
        .map((value) => String(value).trim()),
    ),
  )
}

export const isParentEvaluatorOf = (requester, user) => {
  if (!requester || !user?.parentEvaluator) return false

  const parentRef = String(user.parentEvaluator).trim()
  return getRequesterIdentityKeys(requester).includes(parentRef)
}

export const canAccessParentScope = (requester, parentId) => {
  if (!requester || !parentId) return false
  if (String(requester.role || '').trim() === 'Admin') return true

  const parentRef = String(parentId).trim()
  return getRequesterIdentityKeys(requester).includes(parentRef)
}

export const isSubEvaluatorRole = (role) =>
  ['Sub-Evaluator', 'SubEvaluator'].includes(String(role || ''))

/** Roles that receive the full listing document (not public field filter). */
const LISTING_PRIVILEGED_ROLE_KEYS = new Set([
  'admin',
  'assetholder',
  'evaluator',
  'subevaluator',
  'trustee',
])

/**
 * True when the authenticated user should get the complete asset payload
 * (media refs, request/upload docs, phone, lease, premium fields, etc.).
 */
export const isListingPrivilegedUser = (user) => {
  if (!user?.role) return false
  const key = String(user.role)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  return LISTING_PRIVILEGED_ROLE_KEYS.has(key)
}
