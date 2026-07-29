import asyncHandler from 'express-async-handler'
import DeveloperUnit, {
  UNIT_CATEGORIES,
  UNIT_STATUSES,
} from '../models/developerUnitModel.js'
import { requireOwnedProject } from '../utils/developerProjectAccess.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'

const parseOptionalNumber = (value) => {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

const buildUnitPayload = (body, { forCreate = false } = {}) => {
  const unitNumber =
    body.unitNumber !== undefined
      ? String(body.unitNumber || '').trim()
      : undefined

  if (forCreate && !unitNumber) {
    return { ok: false, status: 400, message: 'Unit number is required' }
  }

  if (body.category && !UNIT_CATEGORIES.includes(body.category)) {
    return {
      ok: false,
      status: 400,
      message: `Category must be one of: ${UNIT_CATEGORIES.join(', ')}`,
    }
  }

  if (body.status && !UNIT_STATUSES.includes(body.status)) {
    return {
      ok: false,
      status: 400,
      message: `Status must be one of: ${UNIT_STATUSES.join(', ')}`,
    }
  }

  const payload = {}
  const fields = {
    unitNumber,
    floor: body.floor !== undefined ? String(body.floor || '').trim() : undefined,
    category: body.category,
    builtUpArea: parseOptionalNumber(body.builtUpArea),
    orientation:
      body.orientation !== undefined
        ? String(body.orientation || '').trim()
        : undefined,
    view: body.view !== undefined ? String(body.view || '').trim() : undefined,
    listingPrice: parseOptionalNumber(body.listingPrice),
    currency:
      body.currency !== undefined
        ? String(body.currency || 'AED').trim() || 'AED'
        : undefined,
    bedrooms: parseOptionalNumber(body.bedrooms),
    bathrooms: parseOptionalNumber(body.bathrooms),
    paymentPlan:
      body.paymentPlan !== undefined
        ? sanitizeMongoId(body.paymentPlan) || null
        : undefined,
    status: body.status,
    notes: body.notes !== undefined ? String(body.notes || '').trim() : undefined,
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value
  }

  return { ok: true, payload }
}

const findOwnedUnit = async (unitId, projectId) => {
  const query = { project: projectId, isDeleted: false }
  const mongoId = sanitizeMongoId(unitId)
  if (mongoId) query._id = mongoId
  else query.uuid = String(unitId || '').trim()
  if (!query._id && !query.uuid) return null
  return DeveloperUnit.findOne(query)
}

export const listUnits = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const units = await DeveloperUnit.find({
    project: project._id,
    isDeleted: false,
  })
    .populate({ path: 'paymentPlan', select: 'name uuid' })
    .sort({ unitNumber: 1 })

  return res.status(200).json({
    success: true,
    units,
    categories: UNIT_CATEGORIES,
    statuses: UNIT_STATUSES,
  })
})

export const getUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }
  await unit.populate({ path: 'paymentPlan', select: 'name uuid' })
  return res.status(200).json({ success: true, unit })
})

export const createUnit = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const built = buildUnitPayload(req.body, { forCreate: true })
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  try {
    const unit = await DeveloperUnit.create({
      ...built.payload,
      project: project._id,
      developer: user._id,
    })
    return res.status(201).json({ success: true, message: 'Unit created', unit })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A unit with this number already exists in the project',
      })
    }
    throw error
  }
})

export const bulkCreateUnits = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const rows = Array.isArray(req.body?.units) ? req.body.units : []
  if (!rows.length) {
    return res.status(400).json({
      success: false,
      message: 'Provide an array of units to import',
    })
  }

  const created = []
  const errors = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const built = buildUnitPayload(row, { forCreate: true })
    if (!built.ok) {
      errors.push({ row: i + 1, message: built.message, unitNumber: row?.unitNumber })
      continue
    }
    try {
      const unit = await DeveloperUnit.create({
        ...built.payload,
        project: project._id,
        developer: user._id,
      })
      created.push(unit)
    } catch (error) {
      errors.push({
        row: i + 1,
        unitNumber: built.payload.unitNumber,
        message:
          error?.code === 11000
            ? 'Duplicate unit number'
            : error?.message || 'Failed to create unit',
      })
    }
  }

  return res.status(200).json({
    success: true,
    message: `Imported ${created.length} unit(s)`,
    createdCount: created.length,
    errorCount: errors.length,
    units: created,
    errors,
  })
})

export const updateUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }

  const built = buildUnitPayload(req.body)
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  try {
    Object.assign(unit, built.payload)
    await unit.save()
    return res.status(200).json({ success: true, message: 'Unit updated', unit })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A unit with this number already exists in the project',
      })
    }
    throw error
  }
})

export const deleteUnit = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const unit = await findOwnedUnit(req.params.unitId, project._id)
  if (!unit) {
    return res.status(404).json({ success: false, message: 'Unit not found' })
  }

  unit.isDeleted = true
  unit.deletedAt = new Date()
  await unit.save()

  return res.status(200).json({ success: true, message: 'Unit removed' })
})
