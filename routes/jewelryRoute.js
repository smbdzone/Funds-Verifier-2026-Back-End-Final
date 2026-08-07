import express from 'express'
const router = express.Router()

import {
  createProduct,
  getSingleProduct,
  getAllProduct,
  updateProduct,
  deleteProduct,
  addRating,
  getRelatedProduct,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
} from '../controller/jewelryCtrl.js'
import { getJewelryLocations } from '../controller/listingLocationsCtrl.js'
import {
  authMiddleware,
  isAdmin,
} from '../middlewares/authMiddleware.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { assetHolderUpdate } from '../middlewares/assetHolderUpdate .js'
import {
  formLimiter,
  listingReadLimiter,
} from '../middlewares/rateLimiter.js'
import { listingReadAccess } from '../middlewares/listingReadAccess.js'
// import { uploadPhoto, productImgResize } from '../middlewares/uploadImgs.js';

router.post('/', assetHolderCreate, formLimiter, createProduct)
router.get(
  '/',
  listingReadLimiter,
  ...listingReadAccess,
  getAllProduct
)
router.get('/filter', ...listingReadAccess, getAllProductByFilter)

router.get('/price', ...listingReadAccess, getPrice)
router.get(
  '/locations',
  listingReadLimiter,
  ...listingReadAccess,
  getJewelryLocations,
)

router.get('/related-jewelry', ...listingReadAccess, getRelatedProduct)
router.get('/:id', ...listingReadAccess, getSingleProduct)
// router.put('/wishlist',authMiddleware,isAdmin, addToWishList)
router.put('/rating', ...listingReadAccess, addRating)
// router.put('/upload-imgs',authMiddleware,isAdmin, uploadPhoto.array('images',10),productImgResize, uploadImgs)
// router.put('/:id',authMiddleware,isAdmin, updateProduct)
router.put('/:moduleId', authMiddleware, assetHolderUpdate, updateProduct)
// router.delete('/:id',authMiddleware,isAdmin, deleteProduct)
router.delete('/:id', assetHolderCreate, authorizeUserByUUID, deleteProduct)
// router.delete('/delete-imgs/:id',authMiddleware,isAdmin, deleteImgs)
router.get(
  '/metrics/approved-listings',
  authMiddleware,
  isAdmin,
  getApprovedListingsMetrics
)

export default router
