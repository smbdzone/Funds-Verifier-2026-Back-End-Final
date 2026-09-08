import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {
  assertSelfOrAdminBody,
  assertSelfOrAdminParam,
} from '../middlewares/assertSelfOrAdmin.js'
import { assertTrackerOwnerOrAdmin } from '../middlewares/assertTrackerOwner.js'
import {
  createTransactionTracker,
  deleteTrackerById,
  getAllTrackersByUserId,
  getTrackerById,
  updateTransactionTracker,
} from '../controller/TransactionTrackerController.js'

const router = express.Router()

// Create a new transaction tracker
router.post('/', authMiddleware, assertSelfOrAdminBody('userId'), async (req, res) => {
  try {
    const data = req.body
    const tracker = await createTransactionTracker({ data })
    return res.status(201).json(tracker)
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: error?.message || 'Internal server error!' })
  }
})

// Update a transaction tracker by ID
router.put(
  '/:id',
  authMiddleware,
  assertTrackerOwnerOrAdmin,
  async (req, res) => {
    try {
      const id = req.params.id
      const data = req.body
      const tracker = await updateTransactionTracker({ id, data })
      return res.status(200).json(tracker)
    } catch (error) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Internal server error!' })
    }
  },
)

// Get all transaction tracker by user ID
router.get(
  '/user/:userId',
  authMiddleware,
  assertSelfOrAdminParam('userId'),
  async (req, res) => {
    try {
      const userId = req.params.userId
      const tracker = await getAllTrackersByUserId({ userId })
      return res.status(200).json(tracker)
    } catch (error) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Internal server error!' })
    }
  },
)

// Get a transaction tracker by ID
router.get(
  '/:id',
  authMiddleware,
  assertTrackerOwnerOrAdmin,
  async (req, res) => {
    try {
      const id = req.params.id
      const tracker = await getTrackerById({ id })
      return res.status(200).json(tracker)
    } catch (error) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Internal server error!' })
    }
  },
)

// Delete a transaction tracker by ID
router.delete(
  '/:id',
  authMiddleware,
  assertTrackerOwnerOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params
      const result = await deleteTrackerById({ id })
      return res.status(200).json(result)
    } catch (error) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Internal server error!' })
    }
  },
)

export default router
