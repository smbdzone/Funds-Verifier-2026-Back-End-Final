import express from 'express'
import {
  createBooking,
  getBookings,
  updateBooking,
} from '../controller/bookingCtrl.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import {bookingCreationLimiter} from '../middlewares/rateLimiter.js'

const router = express.Router()

// Create a new booking
router.post(
  '/bookings',
  authMiddleware,
  bookingCreationLimiter,
  authorizeUserByUUID,
  createBooking
)

// Get all bookings
router.get('/bookings', authMiddleware, authorizeUserByUUID, getBookings)

// Update a booking
router.put('/bookings/:id', authMiddleware, authorizeUserByUUID, updateBooking)

export default router
