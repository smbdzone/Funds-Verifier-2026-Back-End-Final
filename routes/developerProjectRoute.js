import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminOnly.js'
import {
  listDeveloperProjects,
  getDeveloperProject,
  createDeveloperProject,
  updateDeveloperProject,
  deleteDeveloperProject,
} from '../controller/developerProjectCtrl.js'
import {
  listUnits,
  getUnit,
  createUnit,
  bulkCreateUnits,
  updateUnit,
  deleteUnit,
} from '../controller/developerUnitCtrl.js'
import {
  listPaymentPlans,
  createPaymentPlan,
  updatePaymentPlan,
  deletePaymentPlan,
} from '../controller/developerPaymentPlanCtrl.js'
import {
  listMedia,
  createMedia,
  deleteMedia,
} from '../controller/developerMediaCtrl.js'
import {
  getProjectReviewChecklist,
  submitProjectForReview,
  listDeveloperReviews,
  listAdminReviewRequests,
  getAdminReviewRequest,
  assignReviewEvaluator,
  updateAdminReviewStatus,
  publishReviewRequest,
} from '../controller/developerReviewCtrl.js'
import { getDeveloperCrmAnalytics } from '../controller/developerAnalyticsCtrl.js'
import {
  listDeveloperInquiries,
  updateDeveloperInquiryStatus,
} from '../controller/developerInquiryCtrl.js'

const router = express.Router()

router.get('/', authMiddleware, listDeveloperProjects)
router.post('/', authMiddleware, createDeveloperProject)

// Developer reviews list (must be before /:id)
router.get('/reviews', authMiddleware, listDeveloperReviews)

// CRM + transaction analytics (must be before /:id)
router.get('/analytics', authMiddleware, getDeveloperCrmAnalytics)

// Buyer inquiries CRM (must be before /:id)
router.get('/inquiries', authMiddleware, listDeveloperInquiries)
router.patch(
  '/inquiries/:id/status',
  authMiddleware,
  updateDeveloperInquiryStatus,
)

// Super Admin review queue (must be before /:projectId)
router.get(
  '/admin/review-requests',
  ...adminOnly,
  listAdminReviewRequests,
)
router.get(
  '/admin/review-requests/:id',
  ...adminOnly,
  getAdminReviewRequest,
)
router.patch(
  '/admin/review-requests/:id/assign',
  ...adminOnly,
  assignReviewEvaluator,
)
router.patch(
  '/admin/review-requests/:id/status',
  ...adminOnly,
  updateAdminReviewStatus,
)
router.post(
  '/admin/review-requests/:id/publish',
  ...adminOnly,
  publishReviewRequest,
)

// Units (Step 5)
router.get('/:projectId/units', authMiddleware, listUnits)
router.post('/:projectId/units', authMiddleware, createUnit)
router.post('/:projectId/units/bulk', authMiddleware, bulkCreateUnits)
router.get('/:projectId/units/:unitId', authMiddleware, getUnit)
router.put('/:projectId/units/:unitId', authMiddleware, updateUnit)
router.delete('/:projectId/units/:unitId', authMiddleware, deleteUnit)

// Payment plans (Step 6)
router.get('/:projectId/payment-plans', authMiddleware, listPaymentPlans)
router.post('/:projectId/payment-plans', authMiddleware, createPaymentPlan)
router.put(
  '/:projectId/payment-plans/:planId',
  authMiddleware,
  updatePaymentPlan,
)
router.delete(
  '/:projectId/payment-plans/:planId',
  authMiddleware,
  deletePaymentPlan,
)

// Media & docs (Step 7)
router.get('/:projectId/media', authMiddleware, listMedia)
router.post('/:projectId/media', authMiddleware, createMedia)
router.delete('/:projectId/media/:mediaId', authMiddleware, deleteMedia)

// Review & submit (Step 8)
router.get('/:projectId/review', authMiddleware, getProjectReviewChecklist)
router.post('/:projectId/submit', authMiddleware, submitProjectForReview)

router.get('/:id', authMiddleware, getDeveloperProject)
router.put('/:id', authMiddleware, updateDeveloperProject)
router.delete('/:id', authMiddleware, deleteDeveloperProject)

export default router
