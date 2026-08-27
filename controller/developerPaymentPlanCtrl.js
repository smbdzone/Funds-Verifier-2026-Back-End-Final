import asyncHandler from 'express-async-handler'
import DeveloperPaymentPlan from '../models/developerPaymentPlanModel.js'
import { requireOwnedProject } from '../utils/developerProjectAccess.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'

const parsePercent = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  if (Number.isNaN(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

const normalizeMilestones = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      label: String(item?.label || '').trim(),
      percent: parsePercent(item?.percent, 0),
      dueLabel: String(item?.dueLabel || '').trim(),
    }))
    .filter((item) => item.percent > 0)
}

const buildPlanPayload = (body, { forCreate = false } = {}) => {
  const name =
    body.name !== undefined ? String(body.name || '').trim() : undefined
  if (forCreate && !name) {
    return { ok: false, status: 400, message: 'Payment plan name is required' }
  }

  const payload = {}
  const fields = {
    name,
    downPaymentPercent:
      body.downPaymentPercent !== undefined
        ? parsePercent(body.downPaymentPercent)
        : undefined,
    constructionPercent:
      body.constructionPercent !== undefined
        ? parsePercent(body.constructionPercent)
        : undefined,
    postHandoverPercent:
      body.postHandoverPercent !== undefined
        ? parsePercent(body.postHandoverPercent)
        : undefined,
    milestones:
      body.milestones !== undefined
        ? normalizeMilestones(body.milestones)
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
    notes: body.notes !== undefined ? String(body.notes || '').trim() : undefined,
    isDefault:
      body.isDefault !== undefined ? Boolean(body.isDefault) : undefined,
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value
  }

  return { ok: true, payload }
}

const findOwnedPlan = async (planId, projectId) => {
  const query = { project: projectId, isDeleted: false }
  const mongoId = sanitizeMongoId(planId)
  if (mongoId) query._id = mongoId
  else query.uuid = String(planId || '').trim()
  if (!query._id && !query.uuid) return null
  return DeveloperPaymentPlan.findOne(query)
}

export const listPaymentPlans = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const plans = await DeveloperPaymentPlan.find({
    project: project._id,
    isDeleted: false,
  }).sort({ isDefault: -1, createdAt: -1 })

  return res.status(200).json({ success: true, plans })
})

export const createPaymentPlan = asyncHandler(async (req, res) => {
  const { user, project } = await requireOwnedProject(req, res)
  const built = buildPlanPayload(req.body, { forCreate: true })
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  if (built.payload.isDefault) {
    await DeveloperPaymentPlan.updateMany(
      { project: project._id, isDeleted: false },
      { $set: { isDefault: false } },
    )
  }

  // Prefill escrow from project if not provided
  const plan = await DeveloperPaymentPlan.create({
    escrowBankName: project.escrowBankName || '',
    escrowAccountName: project.escrowAccountName || '',
    escrowAccountNumber: project.escrowAccountNumber || '',
    escrowIban: project.escrowIban || '',
    ...built.payload,
    project: project._id,
    developer: user._id,
  })

  return res.status(201).json({
    success: true,
    message: 'Payment plan created',
    plan,
  })
})

export const updatePaymentPlan = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const plan = await findOwnedPlan(req.params.planId, project._id)
  if (!plan) {
    return res
      .status(404)
      .json({ success: false, message: 'Payment plan not found' })
  }

  const built = buildPlanPayload(req.body)
  if (!built.ok) {
    return res
      .status(built.status)
      .json({ success: false, message: built.message })
  }

  if (built.payload.isDefault) {
    await DeveloperPaymentPlan.updateMany(
      { project: project._id, isDeleted: false, _id: { $ne: plan._id } },
      { $set: { isDefault: false } },
    )
  }

  Object.assign(plan, built.payload)
  await plan.save()

  return res.status(200).json({
    success: true,
    message: 'Payment plan updated',
    plan,
  })
})

export const deletePaymentPlan = asyncHandler(async (req, res) => {
  const { project } = await requireOwnedProject(req, res)
  const plan = await findOwnedPlan(req.params.planId, project._id)
  if (!plan) {
    return res
      .status(404)
      .json({ success: false, message: 'Payment plan not found' })
  }

  plan.isDeleted = true
  plan.deletedAt = new Date()
  await plan.save()

  return res.status(200).json({ success: true, message: 'Payment plan removed' })
})
