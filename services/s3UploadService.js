import { PutObjectCommand, DeleteObjectCommand, PutObjectTaggingCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import crypto from 'crypto'
import path from 'path'
import { getS3Client, getBuckets } from '../utils/awsConfig.js'

function sanitizeFilename(name) {
  const base = path.basename(name || 'file')
  return base.replace(/[^\w.\-]+/g, '_')
}

export function buildS3Key({ userUUID, category, originalName, now = Date.now() }) {
  const d = new Date(now)
  const yyyy = String(d.getUTCFullYear())
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const safeName = sanitizeFilename(originalName)
  return `${userUUID}/${category}/${yyyy}/${mm}/${now}-${safeName}`
}

export async function uploadToS3({
  buffer,
  originalName,
  contentType,
  bucket,
  userUUID,
  category,
  metadata = {},
  isPublic = false, // New parameter: true for public access, false for private
  // Note: ACL parameter removed - modern S3 buckets often have ACLs disabled
  // Use bucket policies or CloudFront for public access instead
  // For public access, ensure bucket policy allows public read
}) {
  if (!buffer) throw new Error('uploadToS3: missing buffer')
  if (!bucket) throw new Error('uploadToS3: missing bucket')
  if (!userUUID) throw new Error('uploadToS3: missing userUUID')
  if (!category) throw new Error('uploadToS3: missing category')

  const key = buildS3Key({ userUUID, category, originalName })
  const s3 = getS3Client()

  /** S3 object metadata is sent as HTTP headers; restrict to ASCII to avoid PutObject failures. */
  const headerSafe = (v) =>
    String(v ?? '')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '_')
      .slice(0, 1024)

  const baseMeta = {
    'user-uuid': userUUID,
    'original-name': originalName || '',
    'uploaded-at': new Date().toISOString(),
    'content-category': category,
    'is-public': String(isPublic), // Store access type in metadata
    ...metadata,
  }

  // S3 metadata keys must be strings; also avoid undefined
  const cleanedMeta = Object.fromEntries(
    Object.entries(baseMeta)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, headerSafe(String(v))])
  )

  const size = Buffer.byteLength(buffer)

  // Multipart for larger payloads (and to be safe on node memory spikes)
  if (size > 5 * 1024 * 1024) {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: cleanedMeta,
        // ACL removed - use bucket policies for public access
      },
      queueSize: 5,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
    })

    const out = await upload.done()
    return {
      bucket,
      key,
      etag: out.ETag,
      versionId: out.VersionId,
      uploadedAt: new Date(),
      size,
    }
  }

  const put = await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: cleanedMeta,
      // ACL removed - use bucket policies for public access
    })
  )

  return {
    bucket,
    key,
    etag: put.ETag,
    versionId: put.VersionId,
    uploadedAt: new Date(),
    size,
  }
}

export async function uploadImageToS3(file, userUUID, isPublic = false) {
  const buckets = getBuckets()
  return uploadToS3({
    buffer: file.buffer,
    originalName: file.originalname,
    contentType: file.mimetype,
    bucket: buckets.images,
    userUUID,
    category: 'images',
    isPublic,
  })
}

export async function uploadVideoToS3(file, userUUID, isPublic = false) {
  const buckets = getBuckets()
  return uploadToS3({
    buffer: file.buffer,
    originalName: file.originalname,
    contentType: file.mimetype,
    bucket: buckets.videos,
    userUUID,
    category: 'videos',
    isPublic,
  })
}

export async function uploadEncryptedDocumentToS3(
  encryptedBuffer,
  originalName,
  userUUID,
  { iv, tag },
  isPublic = false
) {
  const buckets = getBuckets()
  return uploadToS3({
    buffer: encryptedBuffer,
    originalName,
    contentType: 'application/pdf',
    bucket: buckets.documents,
    userUUID,
    category: 'documents',
    isPublic,
    metadata: {
      encrypted: true,
      // Convert Buffers to hex strings to avoid invalid characters in HTTP headers
      'encryption-iv': Buffer.isBuffer(iv) ? iv.toString('hex') : iv,
      'encryption-tag': Buffer.isBuffer(tag) ? tag.toString('hex') : tag,
      // Helps correlate and debug without leaking sensitive info
      'content-sha256': crypto.createHash('sha256').update(encryptedBuffer).digest('hex'),
    },
  })
}

// Simple delete function - marks file as deleted with S3 tags (soft delete)
export async function deleteFileFromS3(s3Key, bucket) {
  const s3 = getS3Client()

  try {
    // Add deletion tag (soft delete)
    await s3.send(
      new PutObjectTaggingCommand({
        Bucket: bucket,
        Key: s3Key,
        Tagging: {
          TagSet: [
            { Key: 'deleted', Value: 'true' },
            { Key: 'deletedAt', Value: new Date().toISOString() },
          ],
        },
      })
    )
    return { result: 'ok', message: 'File marked as deleted' }
  } catch (error) {
    console.error('Error deleting file from S3:', error)
    throw new Error(`Failed to delete file from S3: ${error.message}`)
  }
}


