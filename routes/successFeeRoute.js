import express from 'express'
import {
  getSuccessFees,
  updateSuccessFees,
  getSoldTransactions,
  sendSuccessFeePaymentLink,
  getPublicFullPayDiscount,
  getPublicSuccessFees,
  reportObligationDisagree,
} from '../controller/successFeeCtrl.js'
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { validateStringLength } from '../middlewares/inputValidation.js'

const router = express.Router()

router.get('/full-pay-discount', getPublicFullPayDiscount)
router.get('/public', getPublicSuccessFees)
router.post(
  '/obligation-disagree',
  optionalAuthMiddleware,
  validateStringLength('context', 100),
  validateStringLength('assetType', 100),
  validateStringLength('listingTitle', 300),
  validateStringLength('listingUuid', 100),
  validateStringLength('message', 1000),
  reportObligationDisagree,
)
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
