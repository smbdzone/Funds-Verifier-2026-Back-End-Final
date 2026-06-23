/**
 * UAE Pass userinfo often returns fullnameEN as comma-separated values with empties,
 * e.g. "HAMZA,BETRAOUI,,,,,". Normalize into first, last, and full display name.
 */
export function parseUaePassName(fullnameEN, lastnameEN) {
  const parts = String(fullnameEN || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const firstName = parts[0] || ''
  const lastNameFromField = String(lastnameEN || '').trim()
  const lastName =
    lastNameFromField || parts.slice(1).join(' ') || parts[1] || ''

  const fromFullname = parts.join(' ')
  let fullName = fromFullname

  if (lastNameFromField) {
    const fullLower = fromFullname.toLowerCase()
    const lastLower = lastNameFromField.toLowerCase()
    if (!fullLower.includes(lastLower)) {
      fullName = fromFullname
        ? `${fromFullname} ${lastNameFromField}`
        : lastNameFromField
    }
  }

  if (!fullName) {
    fullName = lastNameFromField || firstName
  }

  return { firstName, lastName, fullName }
}

export function hasMalformedUaePassName(name) {
  return typeof name === 'string' && name.includes(',')
}
