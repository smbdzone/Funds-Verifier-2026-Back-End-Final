/**
 * UAE Pass userinfo often returns fullnameEN as comma-separated values with empties,
 * e.g. "HAMZA,BETRAOUI,,,,," or "MOHAMMED,BERRADA......".
 * Normalize into a proper spaced full name (no commas / dots / dashes as separators).
 */
export function cleanNameSeparators(value) {
  return String(value || '')
    .replace(/[,.;·•]+/g, ' ')
    .replace(/[-–—_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseUaePassName(fullnameEN, lastnameEN) {
  const cleaned = cleanNameSeparators(fullnameEN)
  const parts = cleaned.split(/\s+/).map((part) => part.trim()).filter(Boolean)

  const firstName = parts[0] || ''
  const lastNameFromField = cleanNameSeparators(lastnameEN)
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

  return { firstName, lastName, fullName: cleanNameSeparators(fullName) }
}

export function hasMalformedUaePassName(name) {
  if (typeof name !== 'string') return false
  return /[,.;·•]|[-–—_]{2,}|\.{2,}/.test(name) || name.includes(',')
}

/** Clean display / Clozer full name from UAE Pass comma blobs or name + lastname. */
export function normalizePersonFullName(name, lastname = '') {
  const raw = String(name ?? '').trim()
  const last = String(lastname ?? '').trim()

  if (hasMalformedUaePassName(raw) || hasMalformedUaePassName(last)) {
    return parseUaePassName(raw, last).fullName
  }

  const cleanedRaw = cleanNameSeparators(raw)
  const cleanedLast = cleanNameSeparators(last)

  if (!cleanedRaw && !cleanedLast) return ''
  if (!cleanedRaw) return cleanedLast
  if (!cleanedLast) return cleanedRaw

  const rawLower = cleanedRaw.toLowerCase()
  const lastLower = cleanedLast.toLowerCase()

  if (rawLower === lastLower) return cleanedRaw
  if (rawLower.endsWith(lastLower) || rawLower.includes(` ${lastLower}`)) {
    return cleanedRaw
  }

  return `${cleanedRaw} ${cleanedLast}`.trim()
}
