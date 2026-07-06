import express from 'express'
import {
  addReview,
  getReviewsByProductId,
  getReviewsByProductIdFromBody,
  getReviewCounts,
  getAdminReviews,
  updateReviewStatus,
  deleteAdminReview,
} from '../controller/reviewCtrl.js'
import { reviewLimiter } from '../middlewares/rateLimiter.js'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'

const router = express.Router()

router.post('/add', reviewLimiter, addReview)
router.get('/get', getReviewsByProductId)
router.post('/get-by-id', getReviewsByProductIdFromBody)
router.post('/count', getReviewCounts)

router.get('/admin/all', authMiddleware, isAdmin, getAdminReviews)
router.patch('/admin/:reviewId/status', authMiddleware, isAdmin, updateReviewStatus)
router.delete('/admin/:reviewId', authMiddleware, isAdmin, deleteAdminReview)

export default router
