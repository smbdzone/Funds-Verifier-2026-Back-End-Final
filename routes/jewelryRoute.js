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
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { assetHolderUpdate } from '../middlewares/assetHolderUpdate .js'
import {
  formLimiter,
  listingReadLimiter,
} from '../middlewares/rateLimiter.js'
import { publicTokenMiddleware } from '../middlewares/publicTokenMiddleware.js'
// import { uploadPhoto, productImgResize } from '../middlewares/uploadImgs.js';

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

router.get('/related-jewelry', publicTokenMiddleware, getRelatedProduct)
router.get(
  '/:id',
  optionalAuthMiddleware,
  publicTokenMiddleware,
  getSingleProduct
)
// router.put('/wishlist',authMiddleware,isAdmin, addToWishList)
router.put('/rating', publicTokenMiddleware, addRating)
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
