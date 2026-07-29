import asyncHandler from 'express-async-handler'
import DeveloperProject from '../models/developerProjectModel.js'
import User from '../models/userModel.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'

const assertApprovedDeveloper = async (req, res) => {
  if (!req.user?._id) {
    res.status(401)
    throw new Error('Unauthorized')
  }
  const user = await User.findById(req.user._id)
  if (!user || user.isDeleted || user.role !== 'Developer') {
    res.status(403)
    throw new Error('Only Developer accounts can manage projects')
  }
  if (user.developerKyc?.status !== 'Approved') {
    res.status(403)
    throw new Error('Corporate KYC must be approved before managing projects')
  }
  return user
}

const findOwnedProject = async (id, developerId) => {
  const query = { isDeleted: false, developer: developerId }
  const mongoId = sanitizeMongoId(id)
  if (mongoId) {
    query._id = mongoId
  } else {
    query.uuid = String(id || '').trim()
  }
  if (!query._id && !query.uuid) return null
  return DeveloperProject.findOne(query)
}

const parseOptionalDate = (value) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const parseOptionalNumber = (value) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

const buildProjectPayload = (body, { forCreate = false } = {}) => {
  const fields = {
    name: body.name !== undefined ? String(body.name || '').trim() : undefined,
    description:
      body.description !== undefined
        ? String(body.description || '').trim()
        : undefined,
    address:
      body.address !== undefined ? String(body.address || '').trim() : undefined,
    city: body.city !== undefined ? String(body.city || '').trim() : undefined,
    country:
      body.country !== undefined ? String(body.country || '').trim() : undefined,
    mapUrl:
      body.mapUrl !== undefined ? String(body.mapUrl || '').trim() : undefined,
    developerLicenseNumber:
      body.developerLicenseNumber !== undefined
        ? String(body.developerLicenseNumber || '').trim()
        : undefined,
    reraNumber:
      body.reraNumber !== undefined
        ? String(body.reraNumber || '').trim()
        : undefined,
    escrowBankName:
      body.escrowBankName !== undefined
        ? String(body.escrowBankName || '').trim()
        : undefined,
    escrowAccountName:
      body.escrowAccountName !== undefined
        ? String(body.escrowAccountName || '').trim()
        : undefined,
    escrowAccountNumber:
      body.escrowAccountNumber !== undefined
        ? String(body.escrowAccountNumber || '').trim()
        : undefined,
    escrowIban:
      body.escrowIban !== undefined
        ? String(body.escrowIban || '').trim()
        : undefined,
    expectedHandoverDate: parseOptionalDate(body.expectedHandoverDate),
    latitude: parseOptionalNumber(body.latitude),
    longitude: parseOptionalNumber(body.longitude),
    status: body.status,
    thumbnailImg:
      body.thumbnailImg !== undefined
        ? sanitizeMongoId(body.thumbnailImg) || null
        : undefined,
    pictures:
      body.pictures !== undefined
        ? sanitizeMongoId(body.pictures) || null
        : undefined,
  }

  const payload = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value
  }

  if (forCreate && !payload.name) {
    return { ok: false, status: 400, message: 'Project name is required' }
  }

  if (
    payload.status &&
    !['Draft', 'Active', 'Archived'].includes(payload.status)
  ) {
    return {
      ok: false,
      status: 400,
      message: 'Status must be Draft, Active, or Archived',
    }
  }

  return { ok: true, payload }
}

export const listDeveloperProjects = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const projects = await DeveloperProject.find({
    developer: user._id,
    isDeleted: false,
  })
    .populate({ path: 'thumbnailImg', select: 'images' })
    .populate({ path: 'pictures', select: 'images' })
    .sort({ createdAt: -1 })

  return res.status(200).json({ success: true, projects })
})

export const getDeveloperProject = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.id, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }
  await project.populate([
    { path: 'thumbnailImg', select: 'images' },
    { path: 'pictures', select: 'images' },
  ])
  return res.status(200).json({ success: true, project })
})

export const createDeveloperProject = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const built = buildProjectPayload(req.body, { forCreate: true })
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  const project = await DeveloperProject.create({
    ...built.payload,
    developer: user._id,
  })
  await project.populate([
    { path: 'thumbnailImg', select: 'images' },
    { path: 'pictures', select: 'images' },
  ])

  return res.status(201).json({
    success: true,
    message: 'Project created',
    project,
  })
})

export const updateDeveloperProject = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.id, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  const built = buildProjectPayload(req.body)
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  Object.assign(project, built.payload)
  await project.save()
  await project.populate([
    { path: 'thumbnailImg', select: 'images' },
    { path: 'pictures', select: 'images' },
  ])

  return res.status(200).json({
    success: true,
    message: 'Project updated',
    project,
  })
})

export const deleteDeveloperProject = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.id, user._id)
  if (!project) {
    return res.status(404).json({ success: false, message: 'Project not found' })
  }

  project.isDeleted = true
  project.deletedAt = new Date()
  await project.save()

  return res.status(200).json({
    success: true,
    message: 'Project removed',
  })
})
