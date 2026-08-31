import express from 'express'
import { createPrivateListingViewRequest } from '../controller/privateListingViewRequestCtrl.js'
import { contactFormLimiter } from '../middlewares/rateLimiter.js'
import {
  validateEmail,
  validateStringLength,
} from '../middlewares/inputValidation.js'

const router = express.Router()

router.post(
  '/private-view-request',
  contactFormLimiter,
  validateEmail,
  validateStringLength('name', 120, 2),
  validateStringLength('phone', 30, 6),
  createPrivateListingViewRequest,
)

export default router
