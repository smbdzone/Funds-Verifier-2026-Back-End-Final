import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * 32-byte key from FILE_AES_KEY:
 * - 64 hex characters → raw 32 bytes
 * - otherwise → SHA-256(utf8 string)
 */
/** Strip trailing inline comments so `KEY=hex... # note` still parses as 64 hex bytes. */
function normalizeFileAesKeyEnv(raw) {
  let s = String(raw ?? '').trim()
  const i = s.indexOf('#')
  if (i !== -1) s = s.slice(0, i).trim()
  return s
}

export function getFileEncryptionKey() {
  const raw = process.env.FILE_AES_KEY
  if (!raw || !String(raw).trim()) {
    throw new Error(
      'FILE_AES_KEY is not set. Use 64 hex characters (32 bytes) or any passphrase (hashed to 32 bytes).',
    )
  }
  const s = normalizeFileAesKeyEnv(raw)
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex')
  }
  return crypto.createHash('sha256').update(s, 'utf8').digest()
}

/**
 * Encrypt file buffer (AES-256-GCM). IV + auth tag are stored per object; key is FILE_AES_KEY only.
 */
export const encryptBuffer = (buffer) => {
  const key = getFileEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv,
    data: encrypted,
    tag,
  }
}

/**
 * Decrypt AES-256-GCM payload. `ivHex` and `tagHex` must be hex strings (as stored on EvaluationCertificate).
 */
export function decryptBuffer(encryptedBuffer, ivHex, tagHex) {
  const key = getFileEncryptionKey()
  const iv = Buffer.from(String(ivHex ?? '').replace(/\s/g, ''), 'hex')
  const tag = Buffer.from(String(tagHex ?? '').replace(/\s/g, ''), 'hex')
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()])
}

// middleware/getClientIP.js
export const getClientIP = (req) => {
  if (!req) return 'unknown' // prevent crash if req is undefined

  let ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || ''

  if (ip.includes(',')) ip = ip.split(',')[0].trim()
  if (ip === '::1') ip = '127.0.0.1'
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '')

  return ip
}

// Middleware example for Express
export const clientIPMiddleware = (req, res, next) => {
  req.clientIP = getClientIP(req)
  next()
}
