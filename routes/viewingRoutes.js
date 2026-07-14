import express from 'express';
import {
  getAvailableSlots,
  createBooking,
  addSlot,
  updateSlot,
  deleteSlot,
  getAllSlots,
  getAvailableSlotsByDate,
  getAllBookings,
  getBookingById,
  getSlotById,
  getSlotsByDate,
  getBookingByAssetId,
  updateViewingById,
  ReadyToTranferAsset,
  cancelTransferSubmission,
  resendTransferPaymentEmail,
  MarkAssetAsTransfered,
  AssetTransferProof,
  deleteBookingById,
  toggleBookingUnderProcess,
  getTransactionBookings,
  updateTrusteeDeposit,
} from "../controller/bookingController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js';
import { bookingCreationLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router()

// GET available slots for a specific date
router.get('/slots', authMiddleware, getAvailableSlots)

// GET available slots for a specific date where isBooked = false
router.get('/slots/available', authMiddleware, getAvailableSlotsByDate)

// GET single slot
router.get('/slot/:id', authMiddleware, getSlotById)

// POST create a new booking
router.post('/book', authMiddleware, bookingCreationLimiter, createBooking)

// POST add a new slot with time slots
router.post('/slots/add', authMiddleware, authorizeUserByUUID, addSlot)

// PUT update a time slot's booked status
router.put('/timeslot/update/:timeSlotId', authMiddleware, updateSlot)

router.put('/trustee/update/:id', authMiddleware, updateViewingById)

// DELETE a slot
router.delete(
  '/slots/delete/:slotId',
  authMiddleware,
  authorizeUserByUUID,
  deleteSlot
)

// GET route to fetch all slots
router.get('/slots/all/:id', authMiddleware, getAllSlots)

// Define the new route
router.get('/slot-by-date', authMiddleware, getSlotsByDate)

// transfer asset
router.post('/ready-to-transfer', authMiddleware, ReadyToTranferAsset)
router.post('/cancel-transfer', authMiddleware, cancelTransferSubmission)
router.post('/transfer-payment/resend', authMiddleware, resendTransferPaymentEmail)
router.post('/transfer-proof', authMiddleware, AssetTransferProof)
router.put('/mark-as-transfer', authMiddleware, MarkAssetAsTransfered)

// Define the new route
router.get('/bookings', authMiddleware, getAllBookings)
router.get('/transactions', authMiddleware, getTransactionBookings)
router.put(
  '/trustee/transaction/:bookingId/deposit',
  authMiddleware,
  updateTrusteeDeposit,
)

// Define the new route for getting a booking by ID (requires auth, ownership check in controller)
router.get("/bookings/:bookingId", authMiddleware, getBookingById);
router.patch(
  '/bookings/:bookingId/under-process',
  authMiddleware,
  toggleBookingUnderProcess,
)
router.delete("/bookings/:bookingId", authMiddleware, deleteBookingById);

router.get('/booking/:assetId', authMiddleware, getBookingByAssetId)

export default router
