/**
 * Bucket-aware signer for any S3 asset (image, video, document, etc.).
 *
 * Why this exists:
 *   Our CloudFront distribution only has the images bucket as an origin.
 *   Other buckets (videos, documents) must be signed directly against S3,
 *   otherwise CloudFront forwards the request to the images bucket and S3
 *   returns `AccessDenied`. This helper picks the right signer based on the
 *   asset's own `s3Bucket` field so callers don't have to repeat the dispatch
 *   logic at every call site.
 *
 * Lazy imports keep this module cheap to require — the CloudFront and S3
 * services both touch `process.env`, which can throw before dotenv has loaded.
 */

let _cf
let _s3
let _cfBucket

async function getCloudFrontSigner() {
  if (_cf) return _cf
  const mod = await import('./cloudFrontSignedUrlService.js')
  _cf = mod.generateCloudFrontSignedUrl
  return _cf
}

async function getS3Signer() {
  if (_s3) return _s3
  const mod = await import('./s3PresignedUrlService.js')
  _s3 = mod.generateS3PresignedUrl
  return _s3
}

function getCloudFrontBucket() {
  if (_cfBucket !== undefined) return _cfBucket
  _cfBucket = process.env.AWS_S3_BUCKET_IMAGES || null
  return _cfBucket
}

/**
 * Returns `{ signedUrl, expiresAt, expiresInSeconds }` for the given object.
 *
 * - If `s3Bucket` is empty or matches `AWS_S3_BUCKET_IMAGES` → CloudFront.
 * - Otherwise (videos / documents / any new bucket) → S3 presigned URL.
 */
export async function generateAssetSignedUrl(
  s3Bucket,
  s3Key,
  expiresInSeconds,
) {
  if (!s3Key) throw new Error('generateAssetSignedUrl: s3Key is required')
  const cfBucket = getCloudFrontBucket()
  if (!s3Bucket || s3Bucket === cfBucket) {
    const cf = await getCloudFrontSigner()
    return cf(s3Key, expiresInSeconds)
  }
  const s3 = await getS3Signer()
  return s3(s3Bucket, s3Key, expiresInSeconds)
}
