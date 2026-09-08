function getApiOrigin() {
  const base = (process.env.API_PUBLIC_URL || process.env.BASE_URL || '').trim()
  if (!base) return null
  try {
    return new URL(base).origin
  } catch {
    return null
  }
}

function isAllowedPdfUrl(target) {
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

/** GET /api/pdf-preview?url=... — proxy PDF for in-browser preview (production /api routing). */
export async function pdfPreviewProxy(req, res) {
  const target = typeof req.query?.url === 'string' ? req.query.url.trim() : ''

  if (!target || !isAllowedPdfUrl(target)) {
    return res.status(400).json({ message: 'Invalid or disallowed document URL' })
  }

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: { Accept: 'application/pdf,*/*' },
    })

    const contentType = String(
      upstream.headers.get('content-type') || '',
    ).toLowerCase()

    if (!upstream.ok) {
      let message = 'Could not load PDF'
      try {
        if (contentType.includes('json')) {
          const body = await upstream.json()
          message = body.message || message
        }
      } catch {
        /* ignore */
      }
      return res.status(upstream.status).json({ message })
    }

    if (contentType.includes('json')) {
      return res.status(502).json({ message: 'Upstream did not return a PDF' })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=120',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    })
    return res.status(200).send(buffer)
  } catch (error) {
    return res.status(502).json({
      message: error?.message || 'PDF proxy failed',
    })
  }
}
