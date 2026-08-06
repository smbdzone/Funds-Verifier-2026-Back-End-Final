import { generateAssetSignedUrl } from '../services/assetSignedUrlService.js'

const PDF_SIGNED_URL_EXPIRY_SECONDS = 20 * 60 // 20 minutes

export async function getDocumentSignedUrl(doc) {
  if (!doc) return null
  const cert = doc.Certificate || doc
  // Signed S3 URLs serve encrypted bytes; clients use /evaluation-certificate/:uuid/pdf
  if (cert.encrypted === true) {
    return null
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
      return null
    }
  }
  if (cert.url) return cert.url
  return null
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
