import { GetObjectCommand } from '@aws-sdk/client-s3'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'
import { getBuckets, getCloudFrontConfig, getS3Client } from '../utils/awsConfig.js'

function getApiOrigin() {
  const base = (process.env.API_PUBLIC_URL || process.env.BASE_URL || '').trim()
  if (!base) return null
  try {
    return new URL(base).origin
  } catch {
    return null
  }
}

function isAllowedMediaUrl(target) {
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  const apiOrigin = getApiOrigin()
  if (apiOrigin && parsed.origin === apiOrigin) {
    return true
  }

  const host = parsed.hostname.toLowerCase()
  const cfDomain = String(getCloudFrontConfig()?.domain || '').toLowerCase()
  if (cfDomain && host === cfDomain) return true
  if (host.endsWith('.cloudfront.net')) return true
  if (host.includes('amazonaws.com')) return true
  if (host === 'fundsverifier.com' || host.endsWith('.fundsverifier.com')) {
    return true
  }

  return false
}

function sanitizeFilename(name) {
  const trimmed = String(name || 'download').trim() || 'download'
  return trimmed.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200)
}

/** Undo accidental double-encoding of signed CloudFront query strings. */
function normalizeDownloadTarget(raw) {
  let target = String(raw || '').trim()
  if (!target) return ''

  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(target)
      if (decoded === target) break
      target = decoded
    } catch {
      break
    }
  }

  return target
}

function parseS3KeyFromMediaUrl(target) {
  try {
    const parsed = new URL(target)
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return key || null
  } catch {
    return null
  }
}

function bucketCandidatesForS3Key(s3Key) {
  const buckets = getBuckets()
  const path = `/${String(s3Key || '')}`.toLowerCase()
  const ordered = []

  if (path.includes('/videos/')) ordered.push(buckets.videos)
  if (path.includes('/images/')) ordered.push(buckets.images)
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(path)) ordered.push(buckets.videos)

  ordered.push(buckets.images, buckets.videos)
  return [...new Set(ordered.filter(Boolean))]
}

async function fetchMediaFromS3(s3Key) {
  const s3 = getS3Client()

  for (const bucket of bucketCandidatesForS3Key(s3Key)) {
    try {
      const out = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
      )
      if (out?.Body) {
        return out
      }
    } catch (error) {
      const code = error?.name || error?.Code
      if (code === 'NoSuchKey' || code === 'NotFound') {
        continue
      }
      throw error
    }
  }

  return null
}

async function fetchMediaFromCloudFront(target) {
  let upstreamOrigin = ''
  try {
    upstreamOrigin = new URL(target).origin
  } catch {
    /* ignore */
  }

  const upstream = await fetch(target, {
    method: 'GET',
    headers: {
      Accept: 'image/*,video/*,application/octet-stream,*/*',
      ...(upstreamOrigin ? { Referer: `${upstreamOrigin}/` } : {}),
    },
  })

  if (!upstream.ok) {
    return { error: upstream.status, message: 'Could not download media' }
  }

  const contentType = String(
    upstream.headers.get('content-type') || '',
  ).toLowerCase()
  if (contentType.includes('json')) {
    return { error: 502, message: 'Upstream did not return media' }
  }

  const buffer = Buffer.from(await upstream.arrayBuffer())
  return { buffer, contentType }
}

async function fetchMediaBuffer(target) {
  const s3Key = parseS3KeyFromMediaUrl(target)

  if (s3Key) {
    try {
      const object = await fetchMediaFromS3(s3Key)
      if (object?.Body) {
        const buffer = Buffer.from(await object.Body.transformToByteArray())
        return {
          buffer,
          contentType: object.ContentType || 'application/octet-stream',
        }
      }
    } catch (error) {
      console.error('listingMediaDownload S3:', error?.message || error)
    }

    try {
      const fresh = generateCloudFrontSignedUrl(s3Key, 3600)
      const fromFreshUrl = await fetchMediaFromCloudFront(fresh.signedUrl)
      if (fromFreshUrl?.buffer) {
        return {
          buffer: fromFreshUrl.buffer,
          contentType: fromFreshUrl.contentType,
        }
      }
    } catch (error) {
      console.error('listingMediaDownload fresh signed URL:', error?.message || error)
    }
  }

  const fromClientUrl = await fetchMediaFromCloudFront(target)
  if (fromClientUrl?.buffer) {
    return {
      buffer: fromClientUrl.buffer,
      contentType: fromClientUrl.contentType,
    }
  }

  return {
    error: fromClientUrl?.error || 502,
    message: fromClientUrl?.message || 'Could not download media',
  }
}

function sendMediaDownload(res, { buffer, contentType, filename }) {
  res.set({
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, max-age=120',
    'X-Content-Type-Options': 'nosniff',
  })
  return res.status(200).send(buffer)
}

/** GET/POST /api/listing-media-download — force file download (no inline preview). */
export async function listingMediaDownloadProxy(req, res) {
  const target =
    typeof req.body?.url === 'string'
      ? req.body.url.trim()
      : typeof req.query?.url === 'string'
        ? req.query.url.trim()
        : ''
  const filename = sanitizeFilename(req.body?.filename ?? req.query?.filename)
  const normalizedTarget = normalizeDownloadTarget(target)

  if (!normalizedTarget || !isAllowedMediaUrl(normalizedTarget)) {
    return res.status(400).json({ message: 'Invalid or disallowed media URL' })
  }

  try {
    const result = await fetchMediaBuffer(normalizedTarget)

    if (!result?.buffer) {
      return res.status(result?.error || 502).json({
        message: result?.message || 'Could not download media',
      })
    }

    return sendMediaDownload(res, {
      buffer: result.buffer,
      contentType: result.contentType,
      filename,
    })
  } catch (error) {
    return res.status(502).json({
      message: error?.message || 'Media download proxy failed',
    })
  }
}
