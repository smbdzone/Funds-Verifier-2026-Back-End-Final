import fs from 'fs'
import path from 'path'

const required = (name) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export const awsConfig = {
  region: process.env.AWS_REGION || 'me-central-1',
  accessKeyId: required('AWS_ACCESS_KEY_ID'),
  secretAccessKey: required('AWS_SECRET_ACCESS_KEY'),
  buckets: {
    images: required('AWS_S3_BUCKET_IMAGES'),
    videos: required('AWS_S3_BUCKET_VIDEOS'),
    documents: required('AWS_S3_BUCKET_DOCUMENTS'),
  },
  cloudFront: {
    domain: required('CLOUDFRONT_DOMAIN'),
    keyPairId: required('CLOUDFRONT_KEY_PAIR_ID'),
    /** Optional if CLOUDFRONT_PRIVATE_KEY or CLOUDFRONT_PRIVATE_KEY_BASE64 is set */
    privateKeyPath: (process.env.CLOUDFRONT_PRIVATE_KEY_PATH || '').trim(),
  },
}

/**
 * Resolve PEM path from env, then common local fallbacks (avoids broken absolute paths from another machine).
 */
function pickExistingCloudFrontKeyFile(configuredPath) {
  const configured = String(configuredPath || '').trim()
  const resolved = path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(process.cwd(), configured)

  const fallbacks = [
    path.join(process.cwd(), 'private_key.pem'),
    path.join(process.cwd(), 'keys', 'private_key.pem'),
    path.join(process.cwd(), 'keys', 'cloudfront_private_key.pem'),
  ]

  const candidates = [resolved, ...fallbacks]
  const seen = new Set()
  for (const filePath of candidates) {
    const n = path.normalize(filePath)
    if (seen.has(n)) continue
    seen.add(n)
    if (fs.existsSync(n)) return n
  }

  throw new Error(
    `CloudFront private key file not found.\n\n` +
    `Checked:\n${[...seen].map((f) => `  - ${f}`).join('\n')}\n\n` +
    `Options:\n` +
    `  1) Copy the PEM to one of the paths above and keep CLOUDFRONT_PRIVATE_KEY_PATH (e.g. private_key.pem).\n` +
    `  2) Set CLOUDFRONT_PRIVATE_KEY to the full PEM (quoted multiline in .env), or\n` +
    `  3) Set CLOUDFRONT_PRIVATE_KEY_BASE64 to the base64 encoding of the PEM file.\n\n` +
    `The key must match CLOUDFRONT_KEY_PAIR_ID in AWS CloudFront.`,
  )
}

function normalizePemPayload(raw) {
  let key = String(raw || '').trim()
  key = key.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')

  if (!/\r|\n/.test(key)) {
    const m = key.match(/^-----BEGIN (.+?)-----\s*(.+?)\s*-----END \1-----$/s)
    if (m) {
      const label = m[1]
      const body = m[2].replace(/\s+/g, '')
      const lines = body.match(/.{1,64}/g) || []
      key = `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
    }
  }

  return key
}

export function readCloudFrontPrivateKey() {
  const inline = process.env.CLOUDFRONT_PRIVATE_KEY?.trim()
  const inlineB64 = process.env.CLOUDFRONT_PRIVATE_KEY_BASE64?.trim()

  let raw
  if (inline) {
    raw = inline
  } else if (inlineB64) {
    try {
      raw = Buffer.from(inlineB64, 'base64').toString('utf8')
    } catch {
      throw new Error('CLOUDFRONT_PRIVATE_KEY_BASE64 is not valid base64')
    }
  } else {
    const p = awsConfig.cloudFront.privateKeyPath
    if (!p) {
      throw new Error(
        `No CloudFront signing key configured. Set one of:\n` +
        `  - CLOUDFRONT_PRIVATE_KEY_PATH=private_key.pem   (PEM file on disk), or\n` +
        `  - CLOUDFRONT_PRIVATE_KEY="<full PEM>"           (quoted; use \\n for single-line), or\n` +
        `  - CLOUDFRONT_PRIVATE_KEY_BASE64=<base64(PEM)>\n\n` +
        `Download the key pair private key from AWS for the ID in CLOUDFRONT_KEY_PAIR_ID.`,
      )
    }
    const resolved = pickExistingCloudFrontKeyFile(p)
    raw = fs.readFileSync(resolved, 'utf8')
  }

  const key = normalizePemPayload(raw)
  if (!key.includes('BEGIN') || !key.includes('PRIVATE KEY')) {
    throw new Error(
      'CloudFront key does not look like a PEM private key (expected BEGIN … PRIVATE KEY).',
    )
  }
  return key
}
