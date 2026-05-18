import { GetObjectCommand } from '@aws-sdk/client-s3'
import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import EvaluationCertificate from '../models/evaluationCertificateModel.js'
import { deleteFileFromS3 } from '../services/s3UploadService.js'
import { getBuckets, getS3Client } from '../utils/awsConfig.js'
import { decryptBuffer } from '../helper/encryption.js'

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
/**
 * Public PDF stream for listing/detail modals.
 * S3 objects are stored encrypted; this endpoint decrypts with FILE_AES_KEY + stored iv/tag.
 * Certificates encrypted before this keying scheme was fixed must be re-uploaded.
 */
const streamEvaluationCertificatePdf = asyncHandler(async (req, res) => {
  const { certificateUuid } = req.params
  if (!certificateUuid || typeof certificateUuid !== 'string') {
    return res.status(400).json({ message: 'Missing certificate uuid' })
  }

  const cert = await EvaluationCertificate.findOne({
    uuid: certificateUuid,
    isDeleted: false,
  }).lean()

  if (!cert) {
    return res.status(404).json({ message: 'Certificate not found' })
  }

  const c = cert.Certificate || {}
  const buckets = getBuckets()
  const bucket = c.s3Bucket || buckets.documents
  const s3Key = c.s3Key
  const ivHex = c.iv
  const tagHex = c.tag
  const filename = (c.name && String(c.name).trim()) || 'evaluation-certificate.pdf'

  if (!c.encrypted) {
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
    const s3 = getS3Client()
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }))
    if (!out.Body) {
      return res.status(502).json({ message: 'Empty object from storage' })
    }
    encryptedBody = Buffer.from(await out.Body.transformToByteArray())
  } catch (err) {
    console.error('streamEvaluationCertificatePdf S3:', err?.message || err)
    return res.status(502).json({ message: 'Could not read certificate from storage' })
  }

  const looksLikePdf = (buf) =>
    buf.length >= 5 && buf.subarray(0, 4).toString('ascii') === '%PDF'

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
