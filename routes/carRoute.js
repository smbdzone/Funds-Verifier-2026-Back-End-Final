import express from 'express'
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
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
  getSingleProductBySlug,
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
import { publicTokenMiddleware } from '../middlewares/publicTokenMiddleware.js'

router.post('/', assetHolderCreate, formLimiter, createProduct)
router.get(
  '/',
  listingReadLimiter,
  optionalAuthMiddleware,
  publicTokenMiddleware,
  getAllProduct
)
router.get('/filter', publicTokenMiddleware, getAllProductByFilter)

router.get('/price', publicTokenMiddleware, getPrice)
router.get('/related-car', publicTokenMiddleware, getRelatedProduct)
router.get(
  '/:id',
  optionalAuthMiddleware,
  publicTokenMiddleware,
  getSingleProduct
)
router.get('/', publicTokenMiddleware, getSingleProductBySlug)
router.put('/rating', publicTokenMiddleware, addRating)
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
