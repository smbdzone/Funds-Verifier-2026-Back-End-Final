import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {
  createTransactionTracker,
  deleteTrackerById,
  getAllTrackersByUserId,
  getTrackerById,
  updateTransactionTracker,
} from '../controller/TransactionTrackerController.js'

const router = express.Router()

// Create a new transaction tracker
router.post('/', authMiddleware, async (req, res) => {
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
router.put('/:id', authMiddleware, async (req, res) => {
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
})

// Get all transaction tracker by user iD
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId
    const tracker = await getAllTrackersByUserId({ userId })
    return res.status(200).json(tracker)
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: error?.message || 'Internal server error!' })
  }
})

// Get a transaction tracker by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id
    const tracker = await getTrackerById({ id })
    return res.status(200).json(tracker)
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: error?.message || 'Internal server error!' })
  }
})

// Delete a transaction tracker by ID
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params

    const tracker = await Tracker.findById(id, { isDeleted: false })

    if (!tracker || tracker.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Tracker not found or already deleted' })
    }

    // Soft delete
    tracker.isDeleted = true
    tracker.deletedAt = new Date()
    await tracker.save()

    return res
      .status(200)
      .json({ message: 'Tracker soft-deleted successfully', tracker })
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: error?.message || 'Internal server error!' })
  }
})
export default router
