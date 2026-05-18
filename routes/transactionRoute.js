import express from 'express'
import {
  createRequest,
  getRequests,
  updateRequest,
  getRequestById,
} from '../controller/transactionCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'

const router = express.Router()
router.post('/', authMiddleware, authorizeUserByUUID, createRequest)
router.get('/', getRequests)
router.get('/transaction/:id', getRequestById)
router.put(
  '/transaction/:id',
  authMiddleware,
  authorizeUserByUUID,
  updateRequest
)

export default router
