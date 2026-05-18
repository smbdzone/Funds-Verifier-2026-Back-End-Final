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
  // addToWishList,
  addRating,
  deleteImgs,
  getRelatedProduct,
  getPrice,
  getAllProductByFilter,
  getSingleProductBySlug,
  getApprovedListingsMetrics,
} from '../controller/boatCtrl.js'
// import { getSingleProductBySlug } from "../controller/carCtrl.js";
// import { uploadPhoto, productImgResize } from '../middlewares/uploadImgs.js';
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
router.get('/related-boat', publicTokenMiddleware, getRelatedProduct)
router.get(
  '/:id',
  optionalAuthMiddleware,
  publicTokenMiddleware,
  getSingleProduct
)
router.get('/', publicTokenMiddleware, getSingleProductBySlug)

// router.put('/wishlist',assetHolderCreate, authorizeUserByUUID,isAdmin, addToWishList)
router.put('/rating', publicTokenMiddleware, addRating)

router.put('/:moduleId', authMiddleware, assetHolderUpdate, updateProduct)
// router.delete('/:id',assetHolderCreate, authorizeUserByUUID,isAdmin, deleteProduct)
router.delete(
  '/:id',
  assetHolderCreate,
  authorizeUserByUUID,
  assetHolderCreate,
  deleteProduct
)
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
