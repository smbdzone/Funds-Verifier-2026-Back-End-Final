import express from 'express'
import {
  createDealPreference,
  getAllDealPreferences,
  getDealPreferenceById,
  updateDealPreference,
  deleteDealPreference,
} from "../controller/dealPreference.controller.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeUserByUUID } from "../middlewares/authorizeUser.js";

const router = express.Router()

// Create a new deal preference (must be authenticated)
router.post('/add', authMiddleware, createDealPreference)

// Get all deal preferences (admin/analytics style – currently open; tighten later if needed)
router.get('/all', getAllDealPreferences)

// Get a deal preference by ID – only owner (by token) can view
router.get('/:id', authMiddleware, authorizeUserByUUID, getDealPreferenceById)

// Update a deal preference by ID – only owner (by token) can update
router.patch(
  '/update/:id',
  authMiddleware,
  authorizeUserByUUID,
  updateDealPreference
)

// Delete a deal preference by ID – only owner (by token) can delete
router.delete(
  '/delete/:id',
  authMiddleware,
  authorizeUserByUUID,
  deleteDealPreference
)

export default router
