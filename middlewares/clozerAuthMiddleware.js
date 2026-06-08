import crypto from 'crypto'
import asyncHandler from 'express-async-handler'

function timingSafeEqual(a, b) {
  if (!a || !b) return false
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Authenticates server-to-server calls from Clozer (transaction fetch + webhooks).
 * Accepts Authorization: Bearer <CLOZER_API_KEY> or X-API-Key header.
 */
export const clozerApiAuth = asyncHandler(async (req, res, next) => {
  const expectedKey = process.env.CLOZER_API_KEY
  if (!expectedKey) {
    console.error('[Clozer] CLOZER_API_KEY is not configured')
    return res.status(503).json({
      success: false,
      message: 'Clozer integration is not configured',
    })
  }

  const bearer = req.headers.authorization
  const apiKeyHeader = req.headers['x-api-key']

  let provided = null
  if (bearer && String(bearer).startsWith('Bearer ')) {
    provided = String(bearer).split(' ')[1]?.trim()
  } else if (apiKeyHeader) {
    provided = String(apiKeyHeader).trim()
  }

  if (!provided || !timingSafeEqual(provided, expectedKey)) {
    console.warn('[Clozer] Unauthorized API access attempt', {
      path: req.path,
      ip: req.ip,
    })
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  next()
})
