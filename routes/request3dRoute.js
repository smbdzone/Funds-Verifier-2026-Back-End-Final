import express from 'express'
import {
  createRequest,
  getRequests,
  updateRequest,
  getRequestById,
} from '../controller/request3dCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { threeDUserOnly } from '../middlewares/verifyWalkthroughOwnership .js'
import { rateLimiter } from '../middlewares/rateLimiter.js'
import { validateEmail } from '../middlewares/inputValidation.js'

const router = express.Router()
router.post('/walkthrough-request', authMiddleware, validateEmail, createRequest)
router.get(
  '/walkthrough-requests',
  authMiddleware,
  rateLimiter,
  threeDUserOnly,
  getRequests
)
router.get(
  '/walkthrough-request/:request',
  authMiddleware,
  rateLimiter,
  threeDUserOnly,
  getRequestById
)

router.put(
  '/walkthrough-request/:request',
  authMiddleware,
  rateLimiter,
  threeDUserOnly,
  updateRequest
)

export default router
