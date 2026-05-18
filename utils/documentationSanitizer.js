/**
 * Documentation Sanitization Utility
 * Filters and sanitizes user documentation based on visibility rules
 */

import { generateAssetSignedUrl } from '../services/assetSignedUrlService.js'

/**
 * Document types that are visible with full details
 * All other document types will only return the type name
 */
const VISIBLE_DOCUMENT_TYPES = [
  'Technical Report',
  'Evaluator Invoices',
  'Evaluator Invoice',
]

/**
 * Check if a document type should be visible with full details
 * @param {String} docType - Document type name
 * @returns {Boolean} - True if document should be visible
 */
function isDocumentVisible(docType) {
  if (!docType) return false
  const normalizedType = docType.trim().toLowerCase()
  return VISIBLE_DOCUMENT_TYPES.some((visibleType) =>
    normalizedType.includes(visibleType.toLowerCase())
  )
}

/**
 * Generate signed URL for a document
 * @param {Object} documentDoc - Document document from database
 * @returns {Object|null} - Object with signedUrl and metadata, or null if invalid
 */
async function getDocumentSignedUrl(documentDoc) {
  if (!documentDoc || !documentDoc.Certificate) {
    return null
  }

  const { s3Bucket, s3Key, encrypted } = documentDoc.Certificate

  // If document has S3 key, generate signed URL (bucket-aware: CloudFront for
  // images bucket, S3-presigned for everything else — see
  // services/assetSignedUrlService.js).
  if (s3Key) {
    try {
      const signed = await generateAssetSignedUrl(s3Bucket, s3Key, 3600)
      return {
        url: signed.signedUrl,
        expiresAt: signed.expiresAt,
        expiresInSeconds: signed.expiresInSeconds,
        encrypted: encrypted || false,
        name: documentDoc.Certificate.name || 'document.pdf',
      }
    } catch (error) {
      console.error('Error generating signed URL:', error)
      return null
    }
  }

  // Fallback to old Cloudinary URL if exists (for backward compatibility)
  if (documentDoc.Certificate.url && !s3Key) {
    return {
      url: documentDoc.Certificate.url,
      encrypted: false,
      name: documentDoc.Certificate.name || 'document.pdf',
    }
  }

  return null
}

/**
 * Sanitize a single documentation entry
 * @param {Object} docEntry - Documentation entry with type and document
 * @param {Boolean} isSelf - Whether requester is viewing their own data
 * @returns {Promise<Object>} - Sanitized documentation entry
 */
async function sanitizeDocumentationEntry(docEntry, isSelf = false) {
  if (!docEntry || !docEntry.type) {
    return null
  }

  const docType = docEntry.type
  const isVisible = isDocumentVisible(docType)

  // For visible document types, return full details with signed URL (if document exists)
  if (isVisible && docEntry.document) {
    const urlData = await getDocumentSignedUrl(docEntry.document)
    // If we got URL data, return full document info
    if (urlData) {
      return {
        type: docType,
        document: {
          _id: docEntry.document._id,
          uuid: docEntry.document.uuid,
          name: docEntry.document.Certificate?.name || 'document.pdf',
          url: urlData.url || null,
          expiresAt: urlData.expiresAt || null,
          expiresInSeconds: urlData.expiresInSeconds || null,
          encrypted: urlData.encrypted || false,
        },
      }
    }
    // If visible but no URL data, still return type only
  }

  // For hidden document types or visible types without document/URL, return only type (to show tick mark)
  return {
    type: docType,
  }
}

/**
 * Sanitize documentation array
 * @param {Array} documentation - Array of documentation entries
 * @param {Boolean} isSelf - Whether requester is viewing their own data
 * @returns {Promise<Array>} - Sanitized documentation array
 */
export async function sanitizeDocumentation(documentation, isSelf = false) {
  if (!documentation || !Array.isArray(documentation)) {
    return []
  }

  // Filter out deleted documents - include docs with type even if document ref is missing
  const activeDocs = documentation.filter(
    (doc) => !doc.isDeleted && doc.type
  )

  // Sanitize each entry
  const sanitized = await Promise.all(
    activeDocs.map((doc) => sanitizeDocumentationEntry(doc, isSelf))
  )

  // Remove null entries
  return sanitized.filter((doc) => doc !== null)
}

/**
 * Get document types only (for tick mark display)
 * @param {Array} documentation - Array of documentation entries
 * @returns {Array<String>} - Array of document type names
 */
export function getDocumentTypes(documentation) {
  if (!documentation || !Array.isArray(documentation)) {
    return []
  }

  return documentation
    .filter((doc) => !doc.isDeleted && doc.type)
    .map((doc) => doc.type)
}

