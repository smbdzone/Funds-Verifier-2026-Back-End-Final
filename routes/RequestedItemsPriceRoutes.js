import express from 'express'
import {
  CreateRequestedItemsPrice,
  deleteRequestedItemsPrice,
  FindRequestedItemsPrice,
  FindRequestedItemsPriceById,
  updateRequestedItemsPrice,
} from '../controller/RequestedItemsPriceCtrl.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const router = express.Router()

// create
router.post('/', authMiddleware, authorizeUserByUUID, CreateRequestedItemsPrice)
// get single by filteration
router.get('/', authMiddleware, authorizeUserByUUID, FindRequestedItemsPrice)
// get single by id
router.get(
  '/:id',
  authMiddleware,
  authorizeUserByUUID,
  FindRequestedItemsPriceById
)
// update
router.put(
  '/:id',
  authMiddleware,
  authorizeUserByUUID,
  updateRequestedItemsPrice
)
// delete
router.delete(
  '/:id',
  authMiddleware,
  authorizeUserByUUID,
  deleteRequestedItemsPrice
)

export default router
