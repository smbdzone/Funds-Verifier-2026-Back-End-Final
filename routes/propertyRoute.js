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
  getOffPlanRequests,
  updateOffPlanRequestStatus,
  requestOffPlanDocuments,
  requestOffPlanApprovalFee,
  updateOffPlanAgencyAgreement,
} from '../controller/propertyCtrl.js'
import { createDeveloperInquiry } from '../controller/developerInquiryCtrl.js'
import {
  authMiddleware,
  isAdmin,
} from '../middlewares/authMiddleware.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'
import { assetHolderUpdate } from '../middlewares/assetHolderUpdate .js'
import { formLimiter, listingReadLimiter } from '../middlewares/rateLimiter.js'
import { listingReadAccess } from '../middlewares/listingReadAccess.js'

router.post('/', assetHolderCreate, formLimiter, createProduct)
router.get(
  '/',
  listingReadLimiter,
  ...listingReadAccess,
  getAllProduct,
)
router.get('/filter', ...listingReadAccess, getAllProductByFilter)
router.get('/price', ...listingReadAccess, getPrice)
router.get('/related-property', ...listingReadAccess, getRelatedProduct)
router.get(
  '/admin/offplan-requests',
  authMiddleware,
  isAdmin,
  getOffPlanRequests,
)
router.patch(
  '/admin/offplan/:moduleId/status',
  authMiddleware,
  isAdmin,
  updateOffPlanRequestStatus,
)
router.patch(
  '/admin/offplan/:moduleId/request-documents',
  authMiddleware,
  isAdmin,
  requestOffPlanDocuments,
)
router.patch(
  '/admin/offplan/:moduleId/request-approval-fee',
  authMiddleware,
  isAdmin,
  requestOffPlanApprovalFee,
)
router.patch(
  '/admin/offplan/:moduleId/agency-agreement',
  authMiddleware,
  isAdmin,
  updateOffPlanAgencyAgreement,
)
router.put('/rating', ...listingReadAccess, addRating)
router.post(
  '/:id/developer-inquiry',
  authMiddleware,
  formLimiter,
  createDeveloperInquiry,
)
router.put('/:moduleId', authMiddleware, assetHolderUpdate, updateProduct)
router.delete('/:deleteId', authMiddleware, assetHolderCreate, deleteProduct)
router.get('/:id', ...listingReadAccess, getSingleProperty)
router.get(
  '/metrics/approved-listings',
  authMiddleware,
  isAdmin,
  getApprovedListingsMetrics,
)

export default router
