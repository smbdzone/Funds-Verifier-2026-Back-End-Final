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
