import { sanitizeMongoId } from './nosqlSanitizer.js'

/** Media / certificate ObjectId fields that must never receive preview objects. */
export const LISTING_OBJECT_ID_MEDIA_FIELDS = [
  'qrScan',
  'pictures',
  'thumbnailImg',
  'video',
  'unitLayout',
  'floorPlan',
  'evaluationCertificate',
  'agencyAgreement',
  'titleDeed',
  'technicalReport',
  'video3DWalkthrough',
]

/**
 * Coerce listing media fields in an update body to Mongo ObjectId strings.
 * Drops invalid values (preview objects, empty strings) so CastError → 500 cannot happen.
 */
export function sanitizeListingMediaObjectIds(body) {
  if (!body || typeof body !== 'object') return body

  for (const key of LISTING_OBJECT_ID_MEDIA_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null || value === undefined || value === '') {
      delete body[key]
      continue
    }

    let candidate = value
    if (typeof value === 'object') {
      candidate =
        value._id ??
        value.id ??
        value.assetId ??
        value.certificate?._id ??
        value.certificate?.id ??
        null
    }

    const id = sanitizeMongoId(candidate)
    if (!id) {
      delete body[key]
      continue
    }
    body[key] = id
  }

  return body
}
