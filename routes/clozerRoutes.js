import express from 'express'
import {
  getClozerSampleTransaction,
  getClozerTransaction,
  getClozerTransactionStatus,
  handleInstallmentUpdate,
  initiateClozerPayment,
  listMyInstallments,
  verifyClozerRedirect,
} from '../controller/clozerCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { clozerApiAuth } from '../middlewares/clozerAuthMiddleware.js'

const router = express.Router()

router.post('/initiate', authMiddleware, initiateClozerPayment)
router.get('/my-installments', authMiddleware, listMyInstallments)
router.get('/sample-transaction', clozerApiAuth, getClozerSampleTransaction)
router.get('/verify-redirect/:transaction_id', clozerApiAuth, verifyClozerRedirect)
router.get('/transactions/:transaction_id', clozerApiAuth, getClozerTransaction)
router.get('/status/:transaction_id', authMiddleware, getClozerTransactionStatus)
router.post('/installment-updates', clozerApiAuth, handleInstallmentUpdate)

export default router
