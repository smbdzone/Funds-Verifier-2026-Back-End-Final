/**
 * Document URL Service
 * Handles generation of signed URLs for documents stored in S3
 */

import { generateAssetSignedUrl } from './assetSignedUrlService.js'

/**
 * Generate a signed URL for a document
 *
 * Dispatches by `Certificate.s3Bucket` so documents in non-image buckets
 * (e.g. `fundsverifier-documents-prod`) are signed directly against S3
 * instead of CloudFront — see services/assetSignedUrlService.js for why.
 *
 * @param {Object} documentDoc - DealHunterDoc or EvaluationCertificate
 * @param {Number} expiresInSeconds - URL expiration time (default: 3600 = 1h)
 * @returns {Object|null} - Object with signedUrl and metadata, or null if invalid
 */
export async function getDocumentSignedUrl(
  documentDoc,
  expiresInSeconds = 3600
) {
  if (!documentDoc) {
    return null
  }

  // Handle both DealHunterDoc and EvaluationCertificate models
  const certificate = documentDoc.Certificate || documentDoc
  const s3Key = certificate?.s3Key

  if (!s3Key) {
    // Fallback to old Cloudinary URL if exists (for backward compatibility)
    if (certificate?.url) {
      return {
        url: certificate.url,
        encrypted: certificate.encrypted || false,
        name: certificate.name || 'document.pdf',
      }
    }
    return null
  }

  try {
    const signed = await generateAssetSignedUrl(
      certificate.s3Bucket,
      s3Key,
      expiresInSeconds,
    )
    return {
      url: signed.signedUrl,
      expiresAt: signed.expiresAt,
      expiresInSeconds: signed.expiresInSeconds,
      encrypted: certificate.encrypted || false,
      name: certificate.name || 'document.pdf',
      s3Key: s3Key,
    }
  } catch (error) {
    console.error('Error generating signed URL:', error)
    return null
  }
}

/**
 * Generate signed URLs for multiple documents
 * @param {Array} documents - Array of document documents
 * @param {Number} expiresInSeconds - URL expiration time in seconds
 * @returns {Promise<Array>} - Array of objects with signedUrl and metadata
 */
export async function getMultipleDocumentSignedUrls(
  documents,
  expiresInSeconds = 3600
) {
  if (!documents || !Array.isArray(documents)) {
    return []
  }

  const urlPromises = documents.map((doc) =>
    getDocumentSignedUrl(doc, expiresInSeconds)
  )

  return Promise.all(urlPromises)
}

