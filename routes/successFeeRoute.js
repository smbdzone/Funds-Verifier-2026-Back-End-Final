import express from 'express'
import {
  getSuccessFees,
  updateSuccessFees,
  getSoldTransactions,
  sendSuccessFeePaymentLink,
} from '../controller/successFeeCtrl.js'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'

const router = express.Router()

router.get('/', authMiddleware, isAdmin, getSuccessFees)
router.post('/', authMiddleware, isAdmin, updateSuccessFees)
router.get('/sold-transactions', authMiddleware, isAdmin, getSoldTransactions)
router.post(
  '/send-payment-link',
  authMiddleware,
  isAdmin,
  sendSuccessFeePaymentLink
)

export default router
