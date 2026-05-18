import express from 'express'
import {
  createReport,
  getReports,
  updateReport,
  getReportById,
} from '../controller/reportCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { rateLimiter } from '../middlewares/rateLimiter.js'
import { technicalUserOnly } from '../middlewares/verifyTechnicalOwnership.js'
import { validateEmail, validateUUID } from '../middlewares/inputValidation.js'

const router = express.Router()
router.post('/technical-report', authMiddleware, validateEmail, createReport)
router.get(
  '/technical-report',
  authMiddleware,
  rateLimiter,
  technicalUserOnly,
  getReports
)
router.put(
  '/technical-report/:report',
  authMiddleware,
  rateLimiter,
  technicalUserOnly,
  updateReport
)
router.get(
  '/technical-report/:report',
  authMiddleware,
  rateLimiter,
  technicalUserOnly,
  getReportById
)

export default router
