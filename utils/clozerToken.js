import crypto from 'crypto'

const TOKEN_TTL_MS = 15 * 60 * 1000

function getRedirectSecret() {
  const secret = process.env.CLOZER_REDIRECT_SECRET || process.env.SECRET_KEY
  if (!secret) {
    throw new Error('CLOZER_REDIRECT_SECRET is not configured')
  }
  return secret
}

export function generateFvTransactionId() {
  const segment = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `FV-${segment}`
}

export function signClozerRedirectToken(fvTransactionId, userId, amount) {
  const expiresAt = Date.now() + TOKEN_TTL_MS
  const payload = `${fvTransactionId}:${String(userId)}:${Number(amount)}:${expiresAt}`
  const signature = crypto
    .createHmac('sha256', getRedirectSecret())
    .update(payload)
    .digest('hex')

  const encoded = Buffer.from(
    JSON.stringify({ id: fvTransactionId, exp: expiresAt }),
  ).toString('base64url')

  return { token: `${encoded}.${signature}`, expiresAt: new Date(expiresAt) }
}

export function verifyClozerRedirectToken(token, fvTransactionId, userId, amount) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing token' }
  }

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) {
    return { valid: false, reason: 'Malformed token' }
  }

  let parsed
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'Invalid token payload' }
  }

  if (parsed.id !== fvTransactionId) {
    return { valid: false, reason: 'Transaction mismatch' }
  }

  if (!parsed.exp || Date.now() > parsed.exp) {
    return { valid: false, reason: 'Token expired' }
  }

  const payload = `${fvTransactionId}:${String(userId)}:${Number(amount)}:${parsed.exp}`
  const expected = crypto
    .createHmac('sha256', getRedirectSecret())
    .update(payload)
    .digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Invalid signature' }
  }

  return { valid: true, expiresAt: new Date(parsed.exp) }
}

export function verifyClozerWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.CLOZER_WEBHOOK_SECRET
  if (!secret) {
    return { valid: false, reason: 'Webhook secret not configured' }
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'Missing signature header' }
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  const provided = String(signatureHeader).replace(/^sha256=/, '')
  const sigBuf = Buffer.from(provided, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Invalid webhook signature' }
  }

  return { valid: true }
}
