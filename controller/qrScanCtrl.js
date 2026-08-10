/**
 * Production `/api/*` is Express (not Next). These handlers mirror the
 * Next.js qr-image-proxy / qr-decode routes for fundsverifier.com.
 */

import sharp from 'sharp'
import jsQR from 'jsqr'

function getApiOrigin() {
  const base = (
    process.env.API_PUBLIC_URL ||
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    ''
  ).trim()
  if (!base) return null
  try {
    return new URL(base).origin
  } catch {
    return null
  }
}

function isAllowedImageUrl(target) {
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
  if (host.endsWith('.cloudfront.net')) return true
  if (host.includes('amazonaws.com')) return true
  if (host === 'fundsverifier.com' || host.endsWith('.fundsverifier.com')) {
    return true
  }

  return false
}

function extractTargetUrl(req) {
  if (typeof req.query?.url === 'string' && req.query.url.trim()) {
    return req.query.url.trim()
  }
  // Fallback if query parsing split signed CloudFront params
  const raw = typeof req.originalUrl === 'string' ? req.originalUrl : ''
  const marker = 'url='
  const idx = raw.indexOf(marker)
  if (idx === -1) return ''
  return decodeURIComponent(raw.slice(idx + marker.length).trim())
}

async function fetchImageBuffer(target) {
  const upstream = await fetch(target, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  })

  if (!upstream.ok) {
    const err = new Error(`Upstream image HTTP ${upstream.status}`)
    err.status = upstream.status
    throw err
  }

  const contentType = String(
    upstream.headers.get('content-type') || '',
  ).toLowerCase()

  if (contentType.includes('json') || contentType.includes('text/html')) {
    const err = new Error('Upstream did not return an image')
    err.status = 502
    throw err
  }

  return {
    buffer: Buffer.from(await upstream.arrayBuffer()),
    contentType: contentType.startsWith('image/') ? contentType : 'image/png',
  }
}

async function rgbaFromSharp(pipeline) {
  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (!info?.width || !info?.height || info.channels < 4) return null

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

function tryJsQR(imageData) {
  if (!imageData) return null
  try {
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })
    const raw = result?.data
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

async function decodeQrFromBuffer(buffer) {
  const pipelines = [
    () => sharp(buffer).rotate(),
    () => sharp(buffer).rotate().normalize(),
    () => sharp(buffer).rotate().greyscale().normalize(),
    () =>
      sharp(buffer)
        .rotate()
        .resize({
          width: 1000,
          height: 1000,
          fit: 'inside',
          withoutEnlargement: false,
        }),
    () =>
      sharp(buffer)
        .rotate()
        .normalize()
        .resize({
          width: 1200,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: false,
        }),
    () =>
      sharp(buffer)
        .rotate()
        .greyscale()
        .normalize()
        .resize({
          width: 1200,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: false,
        }),
  ]

  for (const build of pipelines) {
    try {
      const rgba = await rgbaFromSharp(build())
      const payload = tryJsQR(rgba)
      if (payload) return payload
    } catch {
      /* next */
    }
  }

  return null
}

/** GET /api/qr-image-proxy?url=... */
export async function qrImageProxy(req, res) {
  const target = extractTargetUrl(req)

  if (!target || !isAllowedImageUrl(target)) {
    return res.status(400).json({ message: 'Invalid or disallowed image URL' })
  }

  try {
    const { buffer, contentType } = await fetchImageBuffer(target)
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=60',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    })
    return res.status(200).send(buffer)
  } catch (error) {
    const status = error?.status && Number(error.status) < 500 ? error.status : 502
    return res.status(status).json({
      message: error?.message || 'QR image proxy failed',
    })
  }
}

/** GET /api/qr-decode?url=... */
export async function qrDecode(req, res) {
  const target = extractTargetUrl(req)

  if (!target || !isAllowedImageUrl(target)) {
    return res.status(400).json({
      message: 'Invalid or disallowed image URL',
      payload: null,
    })
  }

  try {
    const { buffer } = await fetchImageBuffer(target)
    const payload = await decodeQrFromBuffer(buffer)
    if (!payload) {
      return res.status(200).json({
        payload: null,
        message: 'Could not read the data encoded in this QR image',
      })
    }
    return res.status(200).json({ payload, message: 'ok' })
  } catch (error) {
    const status = error?.status && Number(error.status) < 500 ? error.status : 500
    return res.status(status).json({
      payload: null,
      message: error?.message || 'QR decode failed',
    })
  }
}
