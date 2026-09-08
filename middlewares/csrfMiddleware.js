import crypto from 'crypto'

export const CSRF_COOKIE_NAME = 'csrfToken'
export const CSRF_HEADER_NAME = 'x-csrf-token'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const csrfCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
    ...(isProd && {
      domain: process.env.COOKIE_DOMAIN || '.fundsverifier.com',
    }),
  }
}

function hasBearerAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || !String(header).startsWith('Bearer ')) return false
  return Boolean(String(header).split(' ')[1]?.trim())
}

function timingSafeEqual(a, b) {
  if (!a || !b) return false
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function hasClozerApiKey(req) {
  const expectedKey = process.env.CLOZER_API_KEY
  if (!expectedKey) return false

  const bearer = req.headers.authorization || req.headers.Authorization
  const apiKeyHeader = req.headers['x-api-key']

  let provided = null
  if (bearer && String(bearer).startsWith('Bearer ')) {
    provided = String(bearer).split(' ')[1]?.trim()
  } else if (apiKeyHeader) {
    provided = String(apiKeyHeader).trim()
  }

  return Boolean(provided && timingSafeEqual(provided, expectedKey))
}

function isClozerServerRoute(req) {
  const path = req.originalUrl || req.path || ''
  return (
    path.includes('/clozer/transactions/') ||
    path.includes('/clozer/installment-updates') ||
    path.includes('/clozer/verify-redirect/') ||
    path.includes('/clozer/sample-transaction')
  )
}

function isListingMediaDownloadRoute(req) {
  const path = req.originalUrl || req.path || ''
  return path.includes('/listing-media-download')
}

export function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex')
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions())
  return res.status(200).json({ success: true, csrfToken: token })
}

/**
 * CSRF protection for cookie-based browser requests.
 * Skipped when Authorization Bearer is present (SPA — cross-site cannot set that header).
 * Skipped for Clozer server-to-server routes authenticated via CLOZER_API_KEY.
 */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next()
  }

  if (hasBearerAuth(req)) {
    return next()
  }

  if (isClozerServerRoute(req) && hasClozerApiKey(req)) {
    return next()
  }

  if (isListingMediaDownloadRoute(req)) {
    return next()
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME]
  const headerToken = req.headers[CSRF_HEADER_NAME]

  if (timingSafeEqual(cookieToken, headerToken)) {
    return next()
  }

  return res.status(403).json({
    success: false,
    message: 'Invalid or missing CSRF token',
  })
}
