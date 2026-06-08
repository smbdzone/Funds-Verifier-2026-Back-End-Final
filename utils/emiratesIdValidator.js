const EID_PATTERN = /^784-\d{4}-\d{7}-\d$/

export function sanitizeEmiratesIdPayload(raw) {
  if (!raw || typeof raw !== 'object') return null

  const fullName = String(raw.fullName || '').trim().slice(0, 200)
  const number = String(raw.number || '').trim().slice(0, 30)
  let expiryDate = raw.expiryDate

  if (expiryDate) {
    const parsed = new Date(expiryDate)
    expiryDate = Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  if (!fullName && !number && !expiryDate) return null

  if (number && !EID_PATTERN.test(number)) {
    const err = new Error(
      'Emirates ID number must match format 784-XXXX-XXXXXXX-X',
    )
    err.statusCode = 400
    throw err
  }

  return {
    fullName: fullName || undefined,
    number: number || undefined,
    expiryDate: expiryDate || undefined,
  }
}

export function isEmiratesIdComplete(user) {
  return Boolean(
    user?.emiratesId?.fullName?.trim() &&
      user?.emiratesId?.number?.trim() &&
      user?.emiratesId?.expiryDate,
  )
}
