import asyncHandler from 'express-async-handler'
import DeveloperMedia, { MEDIA_DOC_TYPES } from '../models/developerMediaModel.js'
import DeveloperUnit from '../models/developerUnitModel.js'
import { requireOwnedProject } from '../utils/developerProjectAccess.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'

const findOwnedMedia = async (mediaId, projectId) => {
  const query = { project: projectId, isDeleted: false }
  const mongoId = sanitizeMongoId(mediaId)
  if (mongoId) query._id = mongoId
  else query.uuid = String(mediaId || '').trim()
  if (!query._id && !query.uuid) return null
  return DeveloperMedia.findOne(query)
}

export const listMedia = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const filter = { project: project._id, isDeleted: false }
  const unitId = sanitizeMongoId(req.query.unitId)
  if (unitId) filter.unit = unitId
  else if (req.query.scope === 'project') filter.unit = null

  const media = await DeveloperMedia.find(filter)
    .populate({
      path: 'document',
      select: 'Certificate.name Certificate.url uuid',
    })
    .populate({ path: 'imageAsset', select: 'images' })
    .populate({ path: 'unit', select: 'unitNumber uuid' })
    .sort({ createdAt: -1 })

  return res.status(200).json({
    success: true,
    media,
    docTypes: MEDIA_DOC_TYPES,
  })
})

export const createMedia = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const docType = String(req.body?.docType || '').trim()
  if (!MEDIA_DOC_TYPES.includes(docType)) {
    return res.status(400).json({
      success: false,
      message: `docType must be one of: ${MEDIA_DOC_TYPES.join(', ')}`,
    })
  }

  const fileKind = req.body?.fileKind === 'image' ? 'image' : 'document'
  const documentId = sanitizeMongoId(req.body?.document)
  const imageAssetId = sanitizeMongoId(req.body?.imageAsset)

  if (fileKind === 'document' && !documentId) {
    return res.status(400).json({
      success: false,
      message: 'document id is required for document uploads',
    })
  }
  if (fileKind === 'image' && !imageAssetId) {
    return res.status(400).json({
      success: false,
      message: 'imageAsset id is required for image uploads',
    })
  }

  let unitId = null
  if (req.body?.unit) {
    unitId = sanitizeMongoId(req.body.unit)
    if (!unitId) {
      return res.status(400).json({ success: false, message: 'Invalid unit id' })
    }
    const unit = await DeveloperUnit.findOne({
      _id: unitId,
      project: project._id,
      isDeleted: false,
    })
    if (!unit) {
      return res.status(404).json({ success: false, message: 'Unit not found' })
    }
  }

  const media = await DeveloperMedia.create({
    project: project._id,
    developer: user._id,
    unit: unitId,
    docType,
    title: String(req.body?.title || docType).trim(),
    fileKind,
    document: fileKind === 'document' ? documentId : null,
    imageAsset: fileKind === 'image' ? imageAssetId : null,
  })

  await media.populate([
    {
      path: 'document',
      select: 'Certificate.name Certificate.url uuid',
    },
    { path: 'imageAsset', select: 'images' },
    { path: 'unit', select: 'unitNumber uuid' },
  ])

  return res.status(201).json({
    success: true,
    message: 'Media asset added',
    media,
  })
})

export const deleteMedia = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const media = await findOwnedMedia(req.params.mediaId, project._id)
  if (!media) {
    return res.status(404).json({ success: false, message: 'Media not found' })
  }

  media.isDeleted = true
  media.deletedAt = new Date()
  await media.save()

  return res.status(200).json({ success: true, message: 'Media removed' })
})
