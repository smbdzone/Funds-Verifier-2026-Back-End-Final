/**
 * UAE Pass userinfo often returns fullnameEN as comma-separated values with empties,
 * e.g. "HAMZA,BETRAOUI,,,,,". Normalize into first + last name fields.
 */
export function parseUaePassName(fullnameEN, lastnameEN) {
  const parts = String(fullnameEN || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const firstName = parts[0] || ''
  const lastName = String(lastnameEN || '').trim() || parts[1] || ''

  return { firstName, lastName }
}

export function hasMalformedUaePassName(name) {
  return typeof name === 'string' && name.includes(',')
}
