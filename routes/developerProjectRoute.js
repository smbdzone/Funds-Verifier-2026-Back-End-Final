import express from 'express'
import { authMiddleware } from '../middlewares/authMiddleware.js'
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

const router = express.Router()

router.get('/', authMiddleware, listDeveloperProjects)
router.post('/', authMiddleware, createDeveloperProject)

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

router.get('/:id', authMiddleware, getDeveloperProject)
router.put('/:id', authMiddleware, updateDeveloperProject)
router.delete('/:id', authMiddleware, deleteDeveloperProject)

export default router
