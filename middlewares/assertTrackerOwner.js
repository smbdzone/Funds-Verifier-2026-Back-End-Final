import asyncHandler from 'express-async-handler'
import TransactionTracker from '../models/TransactionTrackerModel.js'

/** Transaction tracker by :id — owner (userId) or Admin only. */
export const assertTrackerOwnerOrAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  if (req.user.role === 'Admin') {
    return next()
  }

  const { id } = req.params
  const tracker = await TransactionTracker.findOne({
    _id: id,
    isDeleted: false,
  })

  if (!tracker) {
    return res.status(404).json({
      success: false,
      message: 'Tracker not found',
    })
  }

  const ownerId = String(tracker.userId)
  const isOwner =
    ownerId === String(req.user._id) || ownerId === String(req.user.uuid)

  if (!isOwner) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden — you can only access your own transaction trackers',
    })
  }

  next()
})
