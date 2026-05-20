import express from 'express'
import {
  getPlatformFees,
  updatePlatformFees,
} from '../controller/platFormFeeCtrl.js'
import { adminOnly } from '../middlewares/adminOnly.js'

const router = express.Router()
// router.post("/", createPrice);
router.get('/', ...adminOnly, getPlatformFees)
router.post('/', ...adminOnly, updatePlatformFees)

export default router
