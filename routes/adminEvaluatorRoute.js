import express from 'express'
import { updateProfileImage, getProfileImage } from '../controller/adminCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { fileUploadLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()

router.post(
  '/update',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  updateProfileImage
)
router.get(
  '/get',
  authMiddleware,
  authorizeUserByUUID,
  getProfileImage
)

export default router
