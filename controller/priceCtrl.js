import Price from '../models/priceModel.js'
import User from '../models/userModel.js'

/** Shared price list for every Evaluator account (not SubEvaluators). */
export const EVALUATOR_SHARED_PRICE_UUID = 'EVALUATOR_SHARED'

function normalizeRole(role) {
  const cleaned = String(role || '')
    .replace(/[\s-_]/g, '')
    .toLowerCase()
  if (cleaned === 'subevaluator') return 'SubEvaluator'
  if (cleaned === 'evaluator') return 'Evaluator'
  return String(role || '')
}

function parsePositivePrice(price) {
  const num = Number(price)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }
  return num
}

function isSubEvaluator(user) {
  return normalizeRole(user?.role) === 'SubEvaluator'
}

function isEvaluator(user) {
  return normalizeRole(user?.role) === 'Evaluator'
}

function forbidSubEvaluator(res) {
  return res.status(403).json({
    message: 'Sub-evaluators cannot view or manage the evaluation price list',
  })
}

/**
 * Resolve which userUUID owns the price rows for this request.
 * Evaluators always read/write the shared list.
 */
function resolvePriceOwnerUuid(reqUser, requestedUuid) {
  if (isEvaluator(reqUser)) return EVALUATOR_SHARED_PRICE_UUID
  return requestedUuid || reqUser?.uuid
}

async function resolveFilterUserUuid(requestedUuid) {
  if (!requestedUuid) return null
  if (requestedUuid === EVALUATOR_SHARED_PRICE_UUID) {
    return EVALUATOR_SHARED_PRICE_UUID
  }
  const owner = await User.findOne({
    uuid: requestedUuid,
    isDeleted: { $ne: true },
  })
    .select('role')
    .lean()
  if (normalizeRole(owner?.role) === 'Evaluator') {
    return EVALUATOR_SHARED_PRICE_UUID
  }
  return requestedUuid
}

/**
 * Move every Evaluator-owned price row onto EVALUATOR_SHARED so the shared
 * price list shows all historically stored prices (not only the first opener’s).
 * Idempotent — safe to run on every list/filter request.
 * Includes soft-deleted Evaluator accounts so their prices are not left orphaned.
 */
async function migrateAllEvaluatorPricesToShared() {
  const evaluators = await User.find({})
    .select('uuid role')
    .lean()

  const evaluatorUuids = [
    ...new Set(
      evaluators
        .filter((u) => normalizeRole(u?.role) === 'Evaluator' && u?.uuid)
        .map((u) => String(u.uuid).trim())
        .filter((uuid) => uuid && uuid !== EVALUATOR_SHARED_PRICE_UUID),
    ),
  ]

  if (!evaluatorUuids.length) return { matched: 0, modified: 0 }

  const result = await Price.updateMany(
    {
      userUUID: { $in: evaluatorUuids },
      isDeleted: false,
    },
    { $set: { userUUID: EVALUATOR_SHARED_PRICE_UUID } },
  )

  return {
    matched: result?.matchedCount ?? result?.n ?? 0,
    modified: result?.modifiedCount ?? result?.nModified ?? 0,
  }
}

export const createPrice = async (req, res) => {
  try {
    if (isSubEvaluator(req.user)) return forbidSubEvaluator(res)

    const { assetType, value, price, subCategory, category, userUUID } =
      req.body

    if (!assetType || !price || !category) {
      return res
        .status(400)
        .json({ message: 'All required fields must be provided' })
    }

    const validPrice = parsePositivePrice(price)
    if (validPrice === null) {
      return res.status(400).json({ message: 'Price must be a positive number' })
    }

    const ownerUuid = resolvePriceOwnerUuid(req.user, userUUID)
    if (!ownerUuid) {
      return res.status(400).json({ message: 'userUUID is required' })
    }

    const newReport = new Price({
      assetType,
      value,
      price: String(validPrice),
      category,
      subCategory,
      userUUID: ownerUuid,
    })

    await newReport.save()

    res
      .status(201)
      .json({ message: 'Price added successfully', price: newReport })
  } catch (error) {
    res.status(500).json({ message: 'Error submitting request', error })
  }
}

export const getPrices = async (req, res) => {
  const { id } = req.params

  try {
    if (isSubEvaluator(req.user)) return forbidSubEvaluator(res)

    // TEMP OPEN: allow shared list read even when session is missing.
    // Prefer authenticated owner resolution; fall back to shared/id param.
    let ownerUuid = resolvePriceOwnerUuid(req.user, id)
    if (!ownerUuid) {
      ownerUuid =
        id === EVALUATOR_SHARED_PRICE_UUID || !id
          ? EVALUATOR_SHARED_PRICE_UUID
          : id
    }

    // Backfill: all personal Evaluator UUID rows → shared list.
    if (ownerUuid === EVALUATOR_SHARED_PRICE_UUID) {
      await migrateAllEvaluatorPricesToShared()
    }

    const reports = await Price.find({
      userUUID: ownerUuid,
      isDeleted: false,
    }).select('-_id -isDeleted -deletedAt')
    res.status(200).json(reports)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const filterPrice = async (req, res) => {
  const { userUUID, category, subCategory, value, assetType } = req.query

  try {
    if (isSubEvaluator(req.user)) return forbidSubEvaluator(res)

    const query = { isDeleted: false }

    if (userUUID) {
      query.userUUID = await resolveFilterUserUuid(String(userUUID))
      // Ensure legacy personal evaluator prices are visible in shared lookups.
      if (query.userUUID === EVALUATOR_SHARED_PRICE_UUID) {
        await migrateAllEvaluatorPricesToShared()
      }
    }
    if (category) query.category = category
    if (subCategory) query.subCategory = subCategory
    if (value) query.value = value
    if (assetType) query.assetType = assetType

    const reports = await Price.find(query).select('-_id -isDeleted -deletedAt')
    res.status(200).json(reports)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const getPriceById = async (req, res) => {
  try {
    if (isSubEvaluator(req.user)) return forbidSubEvaluator(res)

    const reportId = req.params.id

    const report = await Price.findOne({
      uuid: reportId,
      isDeleted: false,
    }).select('-_id -isDeleted -deletedAt')

    if (!report) {
      return res.status(404).json({ message: 'Price not found' })
    }

    res.status(200).json(report)
  } catch (error) {
    console.error('Error fetching report by ID:', error)
    res.status(500).json({ message: 'Error fetching report', error })
  }
}

export const updatePrice = async (req, res) => {
  try {
    if (isSubEvaluator(req.user)) return forbidSubEvaluator(res)

    const { id } = req.params

    const existing = await Price.findOne({ uuid: id, isDeleted: false })
    if (!existing) {
      return res.status(404).json({ message: 'Price not found' })
    }

    // Evaluators may only edit the shared list; others only their own rows.
    // Orphan personal-UUID rows are claimed into the shared list first.
    if (isEvaluator(req.user)) {
      if (existing.userUUID !== EVALUATOR_SHARED_PRICE_UUID) {
        await migrateAllEvaluatorPricesToShared()
        const refreshed = await Price.findOne({ uuid: id, isDeleted: false })
        if (
          !refreshed ||
          refreshed.userUUID !== EVALUATOR_SHARED_PRICE_UUID
        ) {
          return res.status(403).json({
            message: 'Evaluators can only update the shared price list',
          })
        }
      }
    } else if (
      existing.userUUID &&
      existing.userUUID !== req.user?.uuid &&
      req.user?.role !== 'Admin'
    ) {
      return res.status(403).json({ message: 'Not allowed to update this price' })
    }

    if (req.body?.price !== undefined) {
      const validPrice = parsePositivePrice(req.body.price)
      if (validPrice === null) {
        return res.status(400).json({ message: 'Price must be a positive number' })
      }
      req.body.price = String(validPrice)
    }

    // Never let clients re-scope shared rows to a personal uuid.
    const patch = { ...req.body }
    delete patch.userUUID
    if (isEvaluator(req.user)) {
      patch.userUUID = EVALUATOR_SHARED_PRICE_UUID
    }

    const updatedReport = await Price.findOneAndUpdate({ uuid: id }, patch, {
      new: true,
    }).select('-_id -isDeleted -deletedAt')

    res
      .status(200)
      .json({ message: 'Report updated successfully', request: updatedReport })
  } catch (error) {
    res.status(500).json({ message: 'Error updating Report', error })
  }
}

export const deletePrice = async (req, res) => {
  const { id } = req.params
  const user = req.user

  try {
    if (isSubEvaluator(user)) return forbidSubEvaluator(res)

    if (isEvaluator(user)) {
      await migrateAllEvaluatorPricesToShared()
    }

    const query = { uuid: id, isDeleted: false }
    if (isEvaluator(user)) {
      query.userUUID = EVALUATOR_SHARED_PRICE_UUID
    } else {
      query.userUUID = user.uuid
    }

    const price = await Price.findOne(query)

    if (!price || price.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Price not found or already deleted' })
    }

    price.isDeleted = true
    price.deletedAt = new Date()
    await price.save()

    res.json({ message: 'Price deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Something went wrong' })
  }
}
