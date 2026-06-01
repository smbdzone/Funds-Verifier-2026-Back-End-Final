import express from 'express'
import {
  authMiddleware,
  isAdmin,
} from '../middlewares/authMiddleware.js'
const router = express.Router()

import {
  createProduct,
  getSingleProduct,
  getAllProduct,
  updateProduct,
  deleteProduct,
  addRating,
  deleteImgs,
  getRelatedProduct,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
} from '../controller/carCtrl.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { assetHolderUpdate } from '../middlewares/assetHolderUpdate .js'
import {
  formLimiter,
  listingReadLimiter,
} from '../middlewares/rateLimiter.js'
import { listingReadAccess } from '../middlewares/listingReadAccess.js'

router.post('/', assetHolderCreate, formLimiter, createProduct)
router.get(
  '/',
  listingReadLimiter,
  ...listingReadAccess,
  getAllProduct
)
router.get('/filter', ...listingReadAccess, getAllProductByFilter)

router.get('/price', ...listingReadAccess, getPrice)
router.get('/related-car', ...listingReadAccess, getRelatedProduct)
router.get('/:id', ...listingReadAccess, getSingleProduct)
router.put('/rating', ...listingReadAccess, addRating)
router.put('/:moduleId', authMiddleware, assetHolderUpdate, updateProduct)
router.delete('/:id', assetHolderCreate, authorizeUserByUUID, deleteProduct)
router.delete(
  '/delete-imgs/:id',
  assetHolderCreate,
  authorizeUserByUUID,
  isAdmin,
  deleteImgs
)
router.get(
  '/metrics/approved-listings',
  authMiddleware,
  isAdmin,
  getApprovedListingsMetrics
)

export default router
