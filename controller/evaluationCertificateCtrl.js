import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import EvaluationCertificate from '../models/evaluationCertificateModel.js'
import DealHunterDoc from '../models/dealHunterDocModel.js'
import { deleteFileFromS3 } from '../services/s3UploadService.js'
import { getBuckets, getS3Client } from '../utils/awsConfig.js'
import { awsConfig } from '../config/s3.js'
import { decryptBuffer } from '../helper/encryption.js'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'

const deleteEvaluationCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)

    const certificate = await EvaluationCertificate.findById(id, {
      isDeleted: false,
    })

    if (!certificate || certificate.isDeleted) {
      return res
        .status(404)
        .json({ message: 'File not found or already deleted' })
    }

    // Optional: delete file from S3 when stored as S3 key
    if (certificate.Certificate?.s3Key) {
      try {
        const buckets = getBuckets()
        await deleteFileFromS3(certificate.Certificate.s3Key, buckets.documents)
      } catch (deleteErr) {
        console.error('Error deleting certificate from S3:', deleteErr?.message)
      }
    }

    // Soft delete: mark as deleted
    certificate.isDeleted = true // make sure your schema has this field
    certificate.deletedAt = new Date() // optional timestamp
    await certificate.save()

    res
      .status(200)
      .json({ message: 'File soft-deleted successfully', certificate })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

function pathStyleS3Client() {
  return new S3Client({
    region: awsConfig.region,
    forcePathStyle: true,
    endpoint: `https://s3.${awsConfig.region}.amazonaws.com`,
    credentials: {
      accessKeyId: awsConfig.accessKeyId,
      secretAccessKey: awsConfig.secretAccessKey,
    },
  })
}

/**
 * Read object bytes with fallbacks for flaky DNS (common on some local networks):
 * 1) default S3 client
 * 2) path-style regional endpoint
 * 3) CloudFront signed HTTP fetch
 * 4) same key on other configured buckets
 */
async function fetchObjectBytes(preferredBucket, s3Key) {
  const buckets = getBuckets()
  const errors = []

  const tryGet = async (client, bucket, label) => {
    const out = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
    )
    if (!out.Body) throw new Error('Empty object body')
    return Buffer.from(await out.Body.transformToByteArray())
  }

  try {
    return await tryGet(getS3Client(), preferredBucket, 'default')
  } catch (err) {
    errors.push(`default[${preferredBucket}]: ${err?.message || err}`)
  }

  try {
    return await tryGet(pathStyleS3Client(), preferredBucket, 'path-style')
  } catch (err) {
    errors.push(`path-style[${preferredBucket}]: ${err?.message || err}`)
  }

  try {
    const { signedUrl } = generateCloudFrontSignedUrl(s3Key, 600)
    const res = await fetch(signedUrl, { method: 'GET' })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('Empty CloudFront body')
    return buf
  } catch (err) {
    errors.push(`cloudfront: ${err?.message || err}`)
  }

  const alternates = [buckets.images, buckets.documents, buckets.videos].filter(
    (b) => b && b !== preferredBucket,
  )
  for (const alt of alternates) {
    try {
      return await tryGet(getS3Client(), alt, alt)
    } catch (err) {
      errors.push(`alt[${alt}]: ${err?.message || err}`)
    }
    try {
      return await tryGet(pathStyleS3Client(), alt, `path:${alt}`)
    } catch (err) {
      errors.push(`path-alt[${alt}]: ${err?.message || err}`)
    }
  }

  console.error('fetchObjectBytes failed:', { preferredBucket, s3Key, errors })
  const error = new Error('Could not read certificate from storage')
  error.details = errors
  throw error
}

/**
 * Public PDF stream for listing/detail modals and KYC docs.
 * S3 objects are stored encrypted; this endpoint decrypts with FILE_AES_KEY + stored iv/tag.
 * Looks up EvaluationCertificate first, then DealHunterDoc (verification / KYC uploads).
 * Certificates encrypted before this keying scheme was fixed must be re-uploaded.
 */
const streamEvaluationCertificatePdf = asyncHandler(async (req, res) => {
  const { certificateUuid } = req.params
  if (!certificateUuid || typeof certificateUuid !== 'string') {
    return res.status(400).json({ message: 'Missing certificate uuid' })
  }

  let cert = await EvaluationCertificate.findOne({
    uuid: certificateUuid,
    isDeleted: false,
  }).lean()

  if (!cert) {
    cert = await DealHunterDoc.findOne({
      uuid: certificateUuid,
      isDeleted: false,
    }).lean()
  }

  if (!cert) {
    return res.status(404).json({ message: 'Certificate not found' })
  }

  const c = cert.Certificate || {}
  const buckets = getBuckets()
  const bucket = c.s3Bucket || buckets.documents
  const s3Key = c.s3Key
  const ivHex = c.iv
  const tagHex = c.tag
  const filename = (c.name && String(c.name).trim()) || 'document.pdf'

  const looksLikePdf = (buf) =>
    buf.length >= 5 && buf.subarray(0, 4).toString('ascii') === '%PDF'

  // Unencrypted: redirect to stored URL or stream from S3 if we have a key
  if (!c.encrypted) {
    if (typeof c.url === 'string' && c.url.startsWith('http') && !s3Key) {
      return res.redirect(302, c.url)
    }
    if (s3Key) {
      try {
        const body = await fetchObjectBytes(bucket, s3Key)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        res.setHeader('Cache-Control', 'private, max-age=120')
        return res.status(200).send(body)
      } catch (err) {
        console.error('streamEvaluationCertificatePdf plain:', err?.message || err)
        if (typeof c.url === 'string' && c.url.startsWith('http')) {
          return res.redirect(302, c.url)
        }
        return res.status(502).json({
          message: 'Could not read document from storage',
          detail: err?.details || undefined,
        })
      }
    }
    if (typeof c.url === 'string' && c.url.startsWith('http')) {
      return res.redirect(302, c.url)
    }
    return res.status(404).json({ message: 'No public URL for this certificate' })
  }

  if (!s3Key || !ivHex || !tagHex) {
    return res.status(404).json({ message: 'Certificate is missing storage metadata' })
  }

  let encryptedBody
  try {
    encryptedBody = await fetchObjectBytes(bucket, s3Key)
  } catch (err) {
    console.error('streamEvaluationCertificatePdf S3:', err?.message || err, err?.details)
    return res.status(502).json({
      message: 'Could not read certificate from storage',
      hint:
        'Local DNS could not reach the documents S3 endpoint. Check internet/DNS, VPN, or firewall, then retry.',
      detail: err?.details || undefined,
    })
  }

  let pdf
  try {
    pdf = decryptBuffer(encryptedBody, ivHex, tagHex)
  } catch (err) {
    console.error('streamEvaluationCertificatePdf decrypt:', err?.message || err)
    // Legacy uploads used a random per-file key that was never stored — not decryptable.
    // Mis-flagged rows: object is already a plain PDF on S3.
    if (looksLikePdf(encryptedBody)) {
      pdf = encryptedBody
    } else {
      return res.status(422).json({
        message:
          'This certificate was encrypted with an older server build that did not store the file key, so it cannot be decrypted. Upload the PDF again from the evaluator flow (or replace the file in storage and fix DB metadata). FILE_AES_KEY is only used for certificates uploaded after that fix.',
      })
    }
  }

  if (!looksLikePdf(pdf)) {
    return res.status(422).json({ message: 'Decrypted content is not a valid PDF' })
  }

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  )
  res.setHeader('Cache-Control', 'private, max-age=120')
  return res.status(200).send(pdf)
})

export { deleteEvaluationCertificate, streamEvaluationCertificatePdf }
