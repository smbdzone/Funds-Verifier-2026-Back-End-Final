import { generateAssetSignedUrl } from '../services/assetSignedUrlService.js'

const PDF_SIGNED_URL_EXPIRY_SECONDS = 20 * 60 // 20 minutes

/** Decrypt-and-stream URL for encrypted-at-rest PDFs. */
function buildDocumentStreamUrl(uuid) {
  if (!uuid || typeof uuid !== 'string') return null
  const trimmed = uuid.trim()
  if (!trimmed) return null

  const fromEnv = String(
    process.env.API_PUBLIC_URL || process.env.BASE_URL || '',
  )
    .trim()
    .replace(/\/+$/, '')
  if (fromEnv) {
    const base = fromEnv.endsWith('/api') ? fromEnv : `${fromEnv}/api`
    return `${base}/evaluation-certificate/${encodeURIComponent(trimmed)}/pdf`
  }
  return `/evaluation-certificate/${encodeURIComponent(trimmed)}/pdf`
}

export async function getDocumentSignedUrl(doc) {
  if (!doc) return null
  const cert = doc.Certificate || doc
  const uuid = typeof doc.uuid === 'string' ? doc.uuid.trim() : ''

  // Encrypted objects are ciphertext on S3 — browsers cannot open them as PDF.
  // Expose the decrypt stream so View / Open in new tab / Download work.
  if (cert.encrypted === true) {
    return buildDocumentStreamUrl(uuid)
  }

  if (cert.s3Key) {
    try {
      const result = await generateAssetSignedUrl(
        cert.s3Bucket,
        cert.s3Key,
        PDF_SIGNED_URL_EXPIRY_SECONDS,
      )
      return result.signedUrl
    } catch (e) {
      console.warn(
        'getDocumentSignedUrl: failed for',
        cert.s3Bucket,
        cert.s3Key,
        e?.message,
      )
      // Prefer decrypt/stream over a dead link whenever we have a uuid.
      return buildDocumentStreamUrl(uuid)
    }
  }
  if (cert.url) return cert.url
  return buildDocumentStreamUrl(uuid)
}

/**
 * Writes `signedUrl` onto listing document refs (evaluation certificate,
 * technical report, etc.) before `sanitizeListingMediaResponse` strips S3 keys.
 * Same behaviour as the historical implementation in `propertyCtrl.js`.
 */
export async function attachDocumentSignedUrls(obj, options = {}) {
  if (!obj) return
  const pdfFields = options.fields || [
    'evaluationCertificate',
    'agencyAgreement',
    'titleDeed',
    'uploadDocument',
    'invoice',
    'technicalReport',
  ]
  await Promise.all(
    pdfFields.map(async (field) => {
      const value = obj[field]
      if (Array.isArray(value)) {
        await Promise.all(
          value.map(async (doc) => {
            if (!doc || typeof doc !== 'object') return
            const signed = await getDocumentSignedUrl(doc)
            if (signed) {
              doc.signedUrl = signed
              if (doc.Certificate) doc.Certificate.signedUrl = signed
            }
          }),
        )
        return
      }

      const signed = await getDocumentSignedUrl(value)
      if (signed) {
        if (!obj[field]) obj[field] = {}
        obj[field].signedUrl = signed
      }
      if (obj[field]?.reportFile) {
        const reportSigned = await getDocumentSignedUrl(obj[field].reportFile)
        if (reportSigned) {
          obj[field].reportFile.signedUrl = reportSigned
          // Listing cards also read `technicalReport.signedUrl` on some clients.
          obj[field].signedUrl = reportSigned
          if (obj[field].reportFile.Certificate) {
            obj[field].reportFile.Certificate.signedUrl = reportSigned
          }
        }
      }
    }),
  )
}
