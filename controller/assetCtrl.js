import ImageAsset from '../models/imgModel.js'
import VideoAsset from '../models/videoModel.js'
import Thumbnail from '../models/thumbnailModel.js'
import asyncHandler from 'express-async-handler'
import mongoose from 'mongoose'
import EvaluationCertificate from '../models/evaluationCertificateModel.js'
import DealHunterDoc from '../models/dealHunterDocModel.js'
import { encryptBuffer } from '../helper/encryption.js'
import { uploadEncryptedDocumentToS3 } from '../services/s3UploadService.js'
import {
  generateCloudFrontSignedUrl,
  cloudFrontUrlForKey,
} from '../services/cloudFrontSignedUrlService.js'
import { VIDEO_MAX_COUNT } from '../utils/uploadLimits.js'
// import validateMongoId from "../utils/validateMongodbId.js";

const findImageAssetByRef = (assetRef) => {
  const id = String(assetRef || '').trim()
  if (!id) return null
  const query = { isDeleted: { $ne: true } }
  if (mongoose.isValidObjectId(id)) {
    query.$or = [{ _id: id }, { uuid: id }]
  } else {
    query.uuid = id
  }
  return ImageAsset.findOne(query)
}

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
      const existing = await findImageAssetByRef(appendToId)
      if (existing) {
        const current = (existing.images || []).filter((img) => !img?.isDeleted)
        existing.images = [...current, ...images]
        existing.markModified('images')
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

const findVideoAssetByRef = (assetRef) => {
  const id = String(assetRef || '').trim()
  if (!id) return null
  const query = { isDeleted: { $ne: true } }
  if (mongoose.isValidObjectId(id)) {
    query.$or = [{ _id: id }, { uuid: id }]
  } else {
    query.uuid = id
  }
  return VideoAsset.findOne(query)
}

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
    const appendToId = String(req.body?.assetId || req.query?.assetId || '').trim()
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

    if (appendToId) {
      const existing = await findVideoAssetByRef(appendToId)
      if (existing) {
        const current = (existing.videos || []).filter((clip) => !clip?.isDeleted)
        if (current.length + videos.length > VIDEO_MAX_COUNT) {
          return res.status(400).json({
            error: `Maximum ${VIDEO_MAX_COUNT} videos allowed.`,
          })
        }
        existing.videos = [...current, ...videos]
        existing.markModified('videos')
        await existing.save()
        const firstKey = existing.videos[0]?.s3Key
        const signed = firstKey
          ? generateCloudFrontSignedUrl(firstKey, SIGNED_URL_EXPIRES_IN_SECONDS)
          : {}
        return res.json({
          ...existing.toObject(),
          signedUrl: signed.signedUrl,
          expiresAt: signed.expiresAt,
          expiresInSeconds: signed.expiresInSeconds,
        })
      }
    }

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

function mediaPathKey(img = {}) {
  const explicit = String(img?.s3Key || img?.public_id || '').trim()
  if (explicit) return explicit
  const raw = String(img?.signedUrl || img?.url || '')
    .split('?')[0]
    .trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''))
  } catch {
    return raw.replace(/^\//, '')
  }
}

function imageFingerprint(img = {}, { includePath = true } = {}) {
  const name = String(img.originalName || img.public_id || '').trim()
  const size = img.size == null ? '' : String(img.size)
  const uploadedAt = img.uploadedAt ? String(img.uploadedAt) : ''
  if (!includePath) return `${name}|${size}|${uploadedAt}`
  const pathOnly = mediaPathKey(img)
  return `${name}|${size}|${uploadedAt}|${pathOnly}`
}

function findImageIndex(existing, used, item) {
  const key = mediaPathKey(item)
  if (key) {
    const byKey = existing.findIndex((img, i) => {
      if (used.has(i)) return false
      const existingKey = mediaPathKey(img)
      return (
        existingKey === key ||
        String(img?.s3Key || '').trim() === key ||
        String(img?.public_id || '').trim() === key
      )
    })
    if (byKey !== -1) return byKey
  }

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

  const imageAsset = await findImageAssetByRef(assetId)
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
    const matched = existing[matchIndex]
    const plain =
      typeof matched?.toObject === 'function' ? matched.toObject() : { ...matched }
    delete plain.isDeleted
    delete plain.deletedAt
    next.push(plain)
  }

  // Never wipe a gallery because fingerprints failed to match.
  if (order.length && next.length === 0) {
    return res.status(200).json(imageAsset)
  }

  // Client list is sanitized (no s3Key). Unmatched rows are NOT deletions —
  // append remaining stored images so car/jewelry galleries cannot shrink.
  if (order.length > next.length) {
    for (let i = 0; i < existing.length; i++) {
      if (used.has(i)) continue
      const matched = existing[i]
      const plain =
        typeof matched?.toObject === 'function'
          ? matched.toObject()
          : { ...matched }
      delete plain.isDeleted
      delete plain.deletedAt
      next.push(plain)
    }
  }

  imageAsset.images = next
  imageAsset.markModified('images')
  await imageAsset.save()
  return res.status(200).json(imageAsset)
})

const imageMatchesDeleteId = (img, id) => {
  if (!img || !id) return false
  const s3Key = String(img.s3Key || '').trim()
  const publicId = String(img.public_id || '').trim()
  if (s3Key === id || publicId === id) return true
  // Tolerate encoded/decoded or path-suffix mismatches from older clients.
  try {
    const decoded = decodeURIComponent(id)
    if (s3Key === decoded || publicId === decoded) return true
  } catch {
    /* ignore */
  }
  // Avoid matching every image when id is tiny/ambiguous.
  if (id.length >= 8 && (s3Key.endsWith(id) || id.endsWith(s3Key))) return true
  return false
}

const deleteImgs = asyncHandler(async (req, res) => {
  const id = String(req.query?.id || req.params?.id || '').trim()
  const assetId = String(req.query?.assetId || req.body?.assetId || '').trim()

  try {
    if (!id) {
      return res.status(400).json({ error: 'Image id is required.' })
    }

    let imageAsset = null
    if (assetId) {
      imageAsset = await ImageAsset.findOne({
        _id: assetId,
        isDeleted: { $ne: true },
      })
    }
    if (!imageAsset) {
      let decoded = id
      try {
        decoded = decodeURIComponent(id)
      } catch {
        /* keep id */
      }
      imageAsset = await ImageAsset.findOne({
        $or: [
          { 'images.public_id': id },
          { 'images.s3Key': id },
          { 'images.public_id': decoded },
          { 'images.s3Key': decoded },
        ],
      })
    }

    if (!imageAsset) {
      return res.status(404).json({ error: 'Image not found in the database.' })
    }

    const before = Array.isArray(imageAsset.images) ? imageAsset.images.length : 0
    const removed = (imageAsset.images || []).filter((img) =>
      imageMatchesDeleteId(img, id),
    )
    imageAsset.images = (imageAsset.images || []).filter(
      (img) => !imageMatchesDeleteId(img, id),
    )

    if (imageAsset.images.length === before) {
      return res.status(404).json({ error: 'Image not found in the images array.' })
    }

    // Mixed array: must markModified or Mongoose will not write the change.
    imageAsset.markModified('images')
    await imageAsset.save()

    return res.json({
      success: true,
      message: 'Image deleted successfully.',
      removedCount: removed.length,
      images: imageAsset.images,
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
