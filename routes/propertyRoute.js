import express from 'express'
const router = express.Router()

import {
  createProduct,
  getAllProduct,
  updateProduct,
  deleteProduct,
  getSingleProperty,
  // addToWishList,
  addRating,
  getRelatedProduct,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
} from '../controller/propertyCtrl.js'
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'
import { assetHolderUpdate } from '../middlewares/assetHolderUpdate .js'
import { formLimiter, listingReadLimiter } from '../middlewares/rateLimiter.js'
import { publicTokenMiddleware } from '../middlewares/publicTokenMiddleware.js'

router.post('/', assetHolderCreate, formLimiter, createProduct)
router.get(
  '/',
  listingReadLimiter,
  publicTokenMiddleware,
  optionalAuthMiddleware,
  getAllProduct,
)
router.get('/filter', publicTokenMiddleware, getAllProductByFilter)
router.get('/price', getPrice)
router.get('/related-property', publicTokenMiddleware, getRelatedProduct)
router.put('/rating', publicTokenMiddleware, addRating)
router.put('/:moduleId', authMiddleware, assetHolderUpdate, updateProduct)
router.delete('/:deleteId', authMiddleware, assetHolderCreate, deleteProduct)
router.get(
  '/:id',
  optionalAuthMiddleware,
  publicTokenMiddleware,
  getSingleProperty,
)
router.get(
  '/metrics/approved-listings',
  authMiddleware,
  isAdmin,
  getApprovedListingsMetrics,
)

export default router
