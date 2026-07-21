/**
 * Strips server-internal S3 metadata from listing responses before they leave
 * the API boundary.
 *
 * What we strip from every media entry and Certificate subdoc:
 *   - `s3Bucket`     — leaks exact bucket names (sibling-bucket guessing).
 *   - `s3Key`        — leaks owner-UUID directory layout (CWE-200 / IDOR aid).
 *   - `s3VersionId`  — leaks that versioning is on + lets attackers target older revisions.
 *   - `s3ETag`       — content hash → cross-listing file fingerprinting.
 *   - `url`          — unsigned CloudFront URL; useless to the client (signedUrl is the only working one) and leaks the distribution domain pattern.
 *
 * What we keep:
 *   - `signedUrl`    — the only URL the client needs.
 *   - `originalName`, `contentType`, `size`, `uploadedAt` — small, useful UI metadata.
 *   - `name`, `encrypted` on Certificate (used by the PDF viewer).
 *
 * The sanitizer MUST run at the response boundary only — not inside Mongoose
 * post-find hooks — because internal server code paths still need `s3Key` /
 * `s3Bucket` to sign URLs or perform key-level operations.
 */

const RISKY_MEDIA_FIELDS = ['s3Bucket', 's3Key', 's3VersionId', 's3ETag', 'url']

function stripFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return
  for (const f of fields) {
    if (f in obj) delete obj[f]
  }
}

function sanitizeMediaArray(arr) {
  if (!Array.isArray(arr)) return
  for (const entry of arr) stripFields(entry, RISKY_MEDIA_FIELDS)
}

function sanitizeDocumentWrapper(doc) {
  if (!doc || typeof doc !== 'object') return
  // Document docs (EvaluationCertificate, DealHunterDoc) wrap their S3 fields
  // inside a `Certificate` subdoc. reportFile mirrors the same shape.
  if (doc.Certificate) stripFields(doc.Certificate, RISKY_MEDIA_FIELDS)
  if (doc.reportFile) sanitizeDocumentWrapper(doc.reportFile)
}

/**
 * In-place sanitization of one populated listing object (Property/Car/Boat/Jewelry).
 *
 * Safe on partial/lean docs and on populated subdocs that haven't yet been
 * filled in (the helper just walks what's there).
 */
const OFF_PLAN_LAYOUT_MEDIA_KEYS = [
  'unitLayout',
  'floorPlan',
  'studioLayout',
  'oneBhkLayout',
  'twoBhkLayout',
  'twoBhkDuplexLayout',
  'threeBhkDuplexLayout',
  'penthouseLayout',
]

export function sanitizeListingMediaResponse(doc) {
  if (!doc || typeof doc !== 'object') return doc

  sanitizeMediaArray(doc?.pictures?.images)
  sanitizeMediaArray(doc?.thumbnailImg?.images)
  sanitizeMediaArray(doc?.video?.videos)

  for (const key of OFF_PLAN_LAYOUT_MEDIA_KEYS) {
    sanitizeMediaArray(doc?.[key]?.images)
  }

  sanitizeDocumentWrapper(doc.evaluationCertificate)
  sanitizeDocumentWrapper(doc.agencyAgreement)
  sanitizeDocumentWrapper(doc.technicalReport)
  sanitizeDocumentWrapper(doc.invoice)

  // `uploadDocument` is an array of doc refs on listings.
  if (Array.isArray(doc.uploadDocument)) {
    for (const d of doc.uploadDocument) sanitizeDocumentWrapper(d)
  } else if (doc.uploadDocument) {
    sanitizeDocumentWrapper(doc.uploadDocument)
  }

  return doc
}

/** Apply to an array of listing objects. */
export function sanitizeListingsMediaResponse(docs) {
  if (!Array.isArray(docs)) return docs
  for (const d of docs) sanitizeListingMediaResponse(d)
  return docs
}
