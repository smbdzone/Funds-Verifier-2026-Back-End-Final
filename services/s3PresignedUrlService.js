/**
 * Generates short-lived S3 presigned URLs (Signature V4) for buckets that
 * aren't served through our CloudFront distribution.
 *
 * Why this exists:
 *   The CloudFront distribution `CLOUDFRONT_DOMAIN` only has the images bucket
 *   as an origin. Videos and documents live in separate buckets, so a request
 *   for `dupgkyd9ugd07.cloudfront.net/.../videos/file.mp4` returns S3
 *   `AccessDenied` (CloudFront forwards to the images bucket, which doesn't
 *   contain that key). For those buckets we sign directly against S3.
 *
 * The signer is loaded lazily so that simply importing this module doesn't
 * read `process.env.AWS_*` (which throws if dotenv hasn't loaded yet — e.g.
 * during Mongoose schema initialization at boot).
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '../utils/awsConfig.js'

const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60

export async function generateS3PresignedUrl(
  s3Bucket,
  s3Key,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
) {
  if (!s3Bucket || !s3Key) {
    throw new Error('generateS3PresignedUrl: s3Bucket and s3Key are required')
  }
  const client = getS3Client()
  const command = new GetObjectCommand({ Bucket: s3Bucket, Key: s3Key })
  const signedUrl = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  })
  return {
    signedUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    expiresInSeconds,
  }
}
