import express from 'express'
import {
  getPlatformFees,
  updatePlatformFees,
} from '../controller/platFormFeeCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'

const router = express.Router()
// router.post("/", createPrice);
router.get('/', authMiddleware, authorizeUserByUUID, getPlatformFees)
router.post('/', authMiddleware, authorizeUserByUUID, updatePlatformFees)

export default router
