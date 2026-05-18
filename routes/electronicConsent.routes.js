import express from 'express'
import {
  createElectronicConsent,
  getAllElectronicConsents,
  getElectronicConsentById,
  updateElectronicConsent,
  deleteElectronicConsent,
} from '../controller/electronicConsent.controller.js'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'

const router = express.Router()

// Create a new electronic consent
router.post(
  '/add',
  authMiddleware,
  authorizeUserByUUID,
  createElectronicConsent
)

// Get all electronic consents
router.get(
  '/all',
  authMiddleware,
  authorizeUserByUUID,
  getAllElectronicConsents
)

// Get an electronic consent by ID
router.get(
  '/:id',
  authMiddleware,
  authorizeUserByUUID,
  getElectronicConsentById
)

// Update an electronic consent by ID
router.patch(
  '/update/:id',
  authMiddleware,
  authorizeUserByUUID,
  updateElectronicConsent
)

// Delete an electronic consent by ID
router.delete(
  '/delete/:id',
  authMiddleware,
  authorizeUserByUUID,
  isAdmin,
  deleteElectronicConsent
)

export default router
