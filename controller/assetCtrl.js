import ImageAsset from '../models/imgModel.js'
import VideoAsset from '../models/videoModel.js'
import Thumbnail from '../models/thumbnailModel.js'
import asyncHandler from 'express-async-handler'
import EvaluationCertificate from '../models/evaluationCertificateModel.js'
import DealHunterDoc from '../models/dealHunterDocModel.js'
import { encryptBuffer } from '../helper/encryption.js'
import { uploadEncryptedDocumentToS3 } from '../services/s3UploadService.js'
import {
  generateCloudFrontSignedUrl,
  cloudFrontUrlForKey,
} from '../services/cloudFrontSignedUrlService.js'
// import validateMongoId from "../utils/validateMongodbId.js";

const uploadImgs = asyncHandler(async (req, res) => {
  try {
    const files = req.files
    const userUUID = req.user?.uuid || req.query.userId
    const appendToId = String(req.body?.assetId || req.query?.assetId || '').trim()
    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour

    const images = (files || []).map((file) => ({
      s3Bucket: file.s3Bucket,
      s3Key: file.s3Key,
      s3VersionId: file.s3VersionId,
      s3ETag: file.s3ETag,
      originalName: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: file.uploadedAt,
      url: file.cloudFrontUrl, // CloudFront read path (unsigned for images)
      signedUrl: generateCloudFrontSignedUrl(
        file.s3Key,
        SIGNED_URL_EXPIRES_IN_SECONDS
      ).signedUrl,
    }))

    // Append to an existing gallery so the listing's single pictures ref keeps all images.
    if (appendToId) {
      const existing = await ImageAsset.findOne({
        _id: appendToId,
        isDeleted: { $ne: true },
      })
      if (existing) {
        existing.images = [...(existing.images || []), ...images]
        await existing.save()
        return res.status(200).json(existing)
      }
    }

    const createImage = await ImageAsset.create({ userUUID, images })

    return res.status(200).json(createImage)
  } catch (err) {
    console.error('Error uploading images:', err)
    return res
      .status(500)
      .json({ error: err?.message || 'Something went wrong!' })
  }
})

const thumbnailImg = asyncHandler(async (req, res) => {
  try {
    const file = req.file
    const userUUID = req.user?.uuid || req.query.userId
    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour
    const createImage = await Thumbnail.create({
      userUUID,
      images: {
        s3Bucket: file.s3Bucket,
        s3Key: file.s3Key,
        s3VersionId: file.s3VersionId,
        s3ETag: file.s3ETag,
        originalName: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        uploadedAt: file.uploadedAt,
        url: file.cloudFrontUrl,
      },
    })
    // Send the response with the created image data
    return res.status(201).json({
      ...createImage.toObject(),
      signedUrl: generateCloudFrontSignedUrl(
        file.s3Key,
        SIGNED_URL_EXPIRES_IN_SECONDS
      ).signedUrl,
      expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
    })
  } catch (err) {
    console.error('Error uploading images:', err)
    return res
      .status(500)
      .json({ error: err?.message || 'Something went wrong!' })
  }
})

const uploadVideoFun = asyncHandler(async (req, res) => {
  try {
    const files = req.files?.length
      ? req.files
      : req.file
        ? [req.file]
        : []
    if (!files.length) {
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    const userUUID = req.user?.uuid || req.query.userId
    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour

    const videos = files.map((file) => ({
      s3Bucket: file.s3Bucket,
      s3Key: file.s3Key,
      s3VersionId: file.s3VersionId,
      s3ETag: file.s3ETag,
      originalName: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      uploadedAt: file.uploadedAt,
      url: file.cloudFrontUrl,
    }))

    const createVideo = await VideoAsset.create({
      userUUID,
      videos,
    })

    const firstKey = files[0].s3Key
    const signed = generateCloudFrontSignedUrl(
      firstKey,
      SIGNED_URL_EXPIRES_IN_SECONDS
    )
    return res.json({
      ...createVideo.toObject(),
      signedUrl: signed.signedUrl,
      expiresAt: signed.expiresAt,
      expiresInSeconds: signed.expiresInSeconds,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ error: err?.message || 'Something went wrong!' })
  }
})

function imageFingerprint(img = {}, { includePath = true } = {}) {
  const name = String(img.originalName || img.public_id || '').trim()
  const size = img.size == null ? '' : String(img.size)
  const uploadedAt = img.uploadedAt ? String(img.uploadedAt) : ''
  if (!includePath) return `${name}|${size}|${uploadedAt}`
  const pathOnly = String(img.signedUrl || img.url || '')
    .split('?')[0]
    .trim()
  return `${name}|${size}|${uploadedAt}|${pathOnly}`
}

function findImageIndex(existing, used, item) {
  const wantedExact = imageFingerprint(item, { includePath: true })
  const exact = existing.findIndex((img, i) => {
    if (used.has(i)) return false
    return imageFingerprint(img, { includePath: true }) === wantedExact
  })
  if (exact !== -1) return exact

  const wantedLoose = imageFingerprint(item, { includePath: false })
  if (!wantedLoose || wantedLoose === '||') return -1
  return existing.findIndex((img, i) => {
    if (used.has(i)) return false
    return imageFingerprint(img, { includePath: false }) === wantedLoose
  })
}

/** Replace ImageAsset.images with the client's ordered (and possibly reduced) list. */
const reorderImgs = asyncHandler(async (req, res) => {
  const { assetId } = req.params
  const order = Array.isArray(req.body?.order) ? req.body.order : []

  if (!assetId) {
    return res.status(400).json({ error: 'Missing asset id' })
  }

  const imageAsset = await ImageAsset.findOne({
    _id: assetId,
    isDeleted: { $ne: true },
  })
  if (!imageAsset) {
    return res.status(404).json({ error: 'Image gallery not found' })
  }

  const existing = Array.isArray(imageAsset.images) ? [...imageAsset.images] : []
  const used = new Set()
  const next = []

  for (const item of order) {
    const matchIndex = findImageIndex(existing, used, item)
    if (matchIndex === -1) continue
    used.add(matchIndex)
    next.push(existing[matchIndex])
  }

  // Never wipe a gallery because fingerprints failed to match.
  if (order.length && next.length === 0) {
    return res.status(200).json(imageAsset)
  }

  imageAsset.images = next
  await imageAsset.save()
  return res.status(200).json(imageAsset)
})

const deleteImgs = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    // During migration, `id` may be Cloudinary public_id OR an S3 key.
    const imageAsset = await ImageAsset.findOne({
      $or: [{ 'images.public_id': id }, { 'images.s3Key': id }],
    })

    if (!imageAsset) {
      throw new Error('Image not found in the database.')
    }

    // Step 2: Find the image inside the array
    const image = imageAsset.images.find(
      (img) => img.public_id === id || img.s3Key === id
    )

    if (!image) {
      throw new Error('Image not found in the images array.')
    }

    // Step 3: Soft delete the image
    image.isDeleted = true // Make sure your image schema has this field
    image.deletedAt = new Date() // optional timestamp

    // Step 4: Save the updated document
    await imageAsset.save()

    return res.json({
      success: true,
      message: 'Image soft-deleted successfully.',
      image,
    })
  } catch (error) {
    console.error('Error deleting image:', error.message)
    return res
      .status(500)
      .json({ error: error?.message || 'Something went wrong!' })
  }
})

const evalCertificate = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  const originalname = req.file.originalname || 'Name'
  const userUUID = req.user?.uuid || req.query.userId

  if (!userUUID) {
    return res.status(400).json({
      error:
        'Missing user UUID on your account. Ensure the JWT user has a uuid field in the database.',
    })
  }

  try {
    const { iv, data, tag } = encryptBuffer(req.file.buffer)
    const ivHex = Buffer.isBuffer(iv) ? iv.toString('hex') : String(iv)
    const tagHex = Buffer.isBuffer(tag) ? tag.toString('hex') : String(tag)

    const uploaded = await uploadEncryptedDocumentToS3(
      data,
      originalname,
      userUUID,
      { iv, tag }
    )

    const signed = generateCloudFrontSignedUrl(uploaded.key, 3600)

    const createCertificate = await EvaluationCertificate.create({
      userUUID,
      Certificate: {
        s3Bucket: uploaded.bucket,
        s3Key: uploaded.key,
        s3VersionId: uploaded.versionId,
        s3ETag: uploaded.etag,
        url: cloudFrontUrlForKey(uploaded.key),
        name: originalname,
        encrypted: true,
        iv: ivHex,
        tag: tagHex,
      },
    })

    res.status(200).json({
      message: 'Certificate uploaded successfully',
      _id: createCertificate._id,
      certificate: {
        uuid: createCertificate.uuid,
        s3Key: createCertificate.Certificate.s3Key,
        name: createCertificate.Certificate.name,
        encrypted: createCertificate.Certificate.encrypted,
        createdAt: createCertificate.createdAt,
      },
      signedUrl: signed.signedUrl,
      expiresInMinutes: 60,
    })
  } catch (err) {
    console.error('evalCertificate:', err?.message || err)
    return res.status(500).json({
      error: err?.message || 'Something went wrong!',
    })
  }
})

const verificationCertificate = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }

  const userUUID = req.user?.uuid || req.query.userUUID
  const originalname = req.file?.originalname || 'Name'

  if (!userUUID) {
    return res.status(400).json({
      error:
        'Missing user UUID on your account. Ensure the JWT user has a uuid field in the database.',
    })
  }

  try {
    const { iv, data, tag } = encryptBuffer(req.file.buffer)
    const ivHex = Buffer.isBuffer(iv) ? iv.toString('hex') : String(iv)
    const tagHex = Buffer.isBuffer(tag) ? tag.toString('hex') : String(tag)

    const uploaded = await uploadEncryptedDocumentToS3(
      data,
      originalname,
      userUUID,
      { iv, tag }
    )

    const createCertificate = await DealHunterDoc.create({
      userUUID,
      Certificate: {
        s3Bucket: uploaded.bucket,
        s3Key: uploaded.key,
        s3VersionId: uploaded.versionId,
        s3ETag: uploaded.etag,
        url: cloudFrontUrlForKey(uploaded.key),
        name: originalname,
        encrypted: true,
        iv: ivHex,
        tag: tagHex,
      },
    })

    // 4️⃣ Generate signed URL for secure access
    const signed = generateCloudFrontSignedUrl(uploaded.key, 3600)

    res.status(200).json({
      message: 'Certificate uploaded successfully',
      certificate: createCertificate,
      signedUrl: signed.signedUrl,
      expiresInMinutes: 60,
    })
  } catch (err) {
    console.error('Error uploading certificate:', err)
    return res
      .status(500)
      .json({ error: err?.message || 'Something went wrong!' })
  }
})

export {
  uploadImgs,
  reorderImgs,
  deleteImgs,
  uploadVideoFun,
  thumbnailImg,
  evalCertificate,
  verificationCertificate,
}
