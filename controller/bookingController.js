import Booking from '../models/Booking.js'
import Slot from '../models/Slot.js'
import {
  getAvailableSlotsService,
  createBookingService,
  addSlotService,
  updateSlotService,
  deleteSlotService,
  getAllSlotsService,
  getAvailableSlotsByDateService,
  getAllBookingsService,
  getBookingByIdService,
  updateSeletedSlotService,
  getBookingByIdAssetValue,
  deleteBookingByIdService,
  getSlotsByDateService,
  roleToSlotCategory,
  VIEWING_SLOT_CATEGORY,
  SERVICE_SLOT_CATEGORY,
  toggleBookingUnderProcessService,
  getTransactionBookingsService,
  updateTrusteeDepositService,
} from '../services/bookingServices.js'
import { createNotification } from './notifications.controller.js'
import { stripe } from '../libs/stripe.js'
import SendAssetTransferingMail from '../utils/asset-transfer/SendAssetTransferingMail.js'
import {
  findAssetForBooking,
  getAssetModelForType,
  patchBookingTransferDocuments,
  patchBookingProductData,
  resolveBookingAssetHolder,
  resolveTransferDocumentsForBooking,
  syncAssetTransactionOnPaymentProof,
  syncAssetTransactionOnTransferComplete,
} from '../utils/transactionBooking.js'

const GetAssetName = getAssetModelForType

// Fetch available slots
export const getAvailableSlots = async (req, res) => {
  try {
    const { date } = req.query
    const slots = await getAvailableSlotsService(date)
    res.status(200).json(slots)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Create booking
export const createBooking = async (req, res) => {
  try {
    const bookingData = req.body
    const { booking, broker } = await createBookingService(bookingData)
    res.status(201).json({ message: 'Booking successful', booking, broker })
  } catch (error) {
    const knownClientErrors = [
      'timeSlotId is required',
      'brokerId is required',
      'assetHolderId is required',
      'productData is required',
      'Time slot not available',
      'Time slot not found',
      'Broker not found',
      'Asset holder not found',
      'This time slot is not available for property viewing',
    ]
    const statusCode = knownClientErrors.includes(error?.message) ? 400 : 500
    res.status(statusCode).json({ message: error.message })
  }
}

// Add slot
export const addSlot = async (req, res) => {
  try {
    const { date, timeSlots, userUUID, slotCategory } = req.body
    const resolvedCategory =
      slotCategory || roleToSlotCategory(req.user?.role)

    const slot = await addSlotService(date, timeSlots, userUUID, {
      slotCategory: resolvedCategory,
      creatorRole: req.user?.role || '',
    })
    res.status(201).json({ message: 'Slot added', slot })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getSlotsByDate = async (req, res) => {
  try {
    const { date, userUUID, slotCategory } = req.query

    if (!date) {
      return res.status(400).json({ error: 'Date is required.' })
    }

    const resolvedCategory = slotCategory || SERVICE_SLOT_CATEGORY
    const slots = await getSlotsByDateService(date, userUUID, resolvedCategory)

    res.status(200).json(slots)
  } catch (error) {
    res.status(500).json({ error: 'Error fetching slots.' })
  }
}

// update slot
export const updateSlot = async (req, res) => {
  try {
    const { timeSlotId } = req.params
    const { timeSlots, date } = req.body

    // Fetch the existing slot document from the database
    const existingSlot = await Slot.findOne({
      uuid: timeSlotId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } },
      ],
    })

    if (!existingSlot) {
      return res.status(404).json({ message: 'Slot not found' })
    }

    const existingTimes = existingSlot.times // Times array from DB

    // Prepare arrays for updates and new entries
    const updates = []
    const newEntries = []

    // Compare the incoming times with the existing times
    timeSlots.forEach((incomingSlot) => {
      const existing = existingTimes?.find(
        (dbSlot) => dbSlot.time === incomingSlot.time
      )

      if (existing) {
        // Update `isBooked` if the slot exists
        if (existing.isBooked !== incomingSlot.isBooked) {
          existing.isBooked = incomingSlot.isBooked
          updates.push(existing)
        }
      } else {
        // Add new slot if it does not exist
        newEntries.push(incomingSlot)
      }
    })

    // Update the existing slots
    updates.forEach((slot) => {
      const index = existingTimes.findIndex(
        (dbSlot) => dbSlot.time === slot.time
      )
      if (index !== -1) {
        existingTimes[index] = slot // Update the time slot
      }
    })

    // Add the new slots
    existingSlot.times.push(...newEntries)

    // Update the date field
    if (date) {
      existingSlot.date = date
    }

    // Save the updated slot document
    await existingSlot.save()

    res.status(200).json({
      message: 'Slot updated successfully',
      updatedSlot: existingSlot,
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Delete slot
export const deleteSlot = async (req, res) => {
  try {
    const { slotId } = req.params
    const { slot, alreadyDeleted } = await deleteSlotService(slotId)

    res.status(200).json({
      success: true,
      message: alreadyDeleted ? 'Slot already deleted' : 'Slot deleted',
      slotId: slot?.uuid,
    })
  } catch (error) {
    const message = error?.message || 'Failed to delete slot'
    const status = /not found/i.test(message) ? 404 : 500
    res.status(status).json({ success: false, message })
  }
}

// Get all slots
export const getAllSlots = async (req, res) => {
  const { id } = req.params
  const user = req.user
  try {
    const slots = await getAllSlotsService(id, user.role)

    res.status(200).json(slots)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Get all bookings
export const getAllBookings = async (req, res) => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    const userId = user?._id?.toString?.()
    const userUUID = user?.uuid
    const userRole = user?.role || ''
    const assignedTo = req.query?.assignedTo

    if (
      assignedTo &&
      !['fv_admin', 'myself'].includes(String(assignedTo).trim())
    ) {
      return res.status(400).json({ message: 'Invalid assignedTo filter.' })
    }

    const bookings = await getAllBookingsService(userId, userRole, userUUID, {
      assignedTo: assignedTo ? String(assignedTo).trim() : undefined,
    })
    res.status(200).json(bookings)

  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// Get slot by ID
export const getSlotById = async (req, res) => {
  try {
    const { id } = req.params

    const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
    const sanitizedId = sanitizeUUID(id)
    if (!sanitizedId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    const slot = await Slot.findOne({ uuid: sanitizedId, isDeleted: false })

    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' })
    }

    res.status(200).json(slot)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

/** Same idea as getAllBookingsService: elevated roles may open any booking. */
const canAccessAnyBookingByRole = (role) => {
  const r = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-_]/g, '')
  return r === 'admin' || r === 'superadmin' || r === 'trustee'
}

// Get booking by ID with ownership/role checks
export const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params
    const requester = req.user

    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const booking = await getBookingByIdService(bookingId)

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' })
    }

    if (canAccessAnyBookingByRole(requester.role)) {
      return res.status(200).json(booking)
    }

    const brokerId = booking.brokerId?._id?.toString()
    const assetHolderId =
      booking.assetHolderId?._id?.toString() ||
      booking.assetHolder?._id?.toString()
    const requesterId = requester._id.toString()

    const isOwner =
      brokerId === requesterId || assetHolderId === requesterId

    if (!isOwner) {
      return res
        .status(403)
        .json({ message: 'Forbidden: Cannot access this booking' })
    }

    res.status(200).json(booking)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}


// Get booking by ID
export const getBookingByAssetId = async (req, res) => {
  try {
    const { assetId } = req.params

    const booking = await getBookingByIdAssetValue(assetId)

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' })
    }

    res.status(200).json(booking)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const deleteBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params
    const deletedBooking = await deleteBookingByIdService(bookingId)
    res.status(200).json({ message: 'Booking deleted successfully', deletedBooking })
  } catch (error) {
    const statusCode = error?.message === 'Booking not found' ? 404 : 500
    res.status(statusCode).json({ message: error.message })
  }
}

// Get available slots by date
export const getAvailableSlotsByDate = async (req, res) => {
  try {
    const { date, userUUID, userId, slotCategory } = req.query
    const ownerUUID = userUUID || userId
    const resolvedCategory = slotCategory || VIEWING_SLOT_CATEGORY

    const availableSlots = await getAvailableSlotsByDateService(
      date,
      ownerUUID,
      resolvedCategory,
    )
    res.status(200).json(availableSlots)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateViewingById = async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body || {}
    const requester = req.user

    const normalizedRole = String(requester?.role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-_]/g, '')

    if (
      normalizedRole !== 'trustee' &&
      normalizedRole !== 'admin' &&
      normalizedRole !== 'superadmin'
    ) {
      return res.status(403).json({
        message: 'Only trustees or admins can update viewing bookings.',
      })
    }

    const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
    const sanitizedId = sanitizeUUID(id)
    if (!sanitizedId) {
      return res.status(400).json({ message: 'Invalid booking id.' })
    }

    const allowedUpdates = {}
    if (
      updates.viewAssignedTo &&
      ['myself', 'fv_admin'].includes(updates.viewAssignedTo)
    ) {
      allowedUpdates.viewAssignedTo = updates.viewAssignedTo
    }
    if (updates.buyerAttended !== undefined) {
      allowedUpdates.buyerAttended = String(Boolean(updates.buyerAttended))
    }
    if (updates.sellerAttended !== undefined) {
      allowedUpdates.sellerAttended = String(Boolean(updates.sellerAttended))
    }
    if (typeof updates.comment === 'string') {
      allowedUpdates.comment = updates.comment.slice(0, 500)
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update.' })
    }

    const updatedBooking = await Booking.findOneAndUpdate(
      { uuid: sanitizedId, isDeleted: false },
      { $set: allowedUpdates },
      { new: true }
    )

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found' })
    }

    try {
      const assigneeLabel =
        allowedUpdates.viewAssignedTo === 'fv_admin'
          ? 'FV Admin'
          : allowedUpdates.viewAssignedTo === 'myself'
            ? 'the trustee'
            : null

      const NotificationData = {
        userId: updatedBooking?.brokerId,
        userUUID: updatedBooking?.brokerUUID,
        UserRole: 'Trustee',
        title: 'Booking updated',
        message: assigneeLabel
          ? `Viewing assignment updated: handled by ${assigneeLabel}.`
          : 'A booking has been updated.',
        RelateRoute: 'Trustee',
        RelatedId: '/trustee',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json(updatedBooking)
    return
  } catch (error) {
    res.status(500).json({ message: 'Server error', error })
    return
  }
}

export const ReadyToTranferAsset = async (req, res) => {
  try {
    const id = req.query.id
    const updates = req.body

    if (!id)
      return res
        .status(400)
        .json({ message: 'Booking id is required is query params.' })
    if (!updates?.assetTransferDocument) {
      return res
        .status(400)
        .json({ message: 'Asset transfer document is required.' })
    }
    if (!updates?.fees) {
      return res
        .status(400)
        .json({ message: 'Asset transfer fees is required.' })
    }
    if (typeof updates?.fees !== 'number') {
      updates.fees = Number(updates?.fees)
    }
    if (!Number.isFinite(updates.fees) || updates.fees <= 0) {
      return res.status(400).json({ message: 'Asset transfer fees must be a positive number.' })
    }
    if (!updates?.success_url) {
      return res
        .status(400)
        .json({ message: 'Asset transfer success url is required.' })
    }
    const success_url = updates?.success_url

    const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
    const sanitizedId = sanitizeUUID(id)
    if (!sanitizedId) {
      return res.status(400).json({ message: 'Invalid booking id.' })
    }

    const booking = await Booking.findOne({ uuid: sanitizedId, isDeleted: false })
      .populate({ path: 'brokerId', select: 'email name' })
      .populate({ path: 'assetHolderId', select: 'email name' })

    if (!booking) {
      return res.status(400).json({ message: 'Booking not found' })
    }

    const { asset } = await findAssetForBooking(booking)

    if (!asset) {
      return res.status(400).json({ message: 'Asset not found' })
    }

    if (!asset.transferDocuments) asset.transferDocuments = {}
    asset.transferDocuments.assetTransferDocument =
      updates?.assetTransferDocument
    asset.transferDocuments.successFee = updates.fees
    await asset.save()

    patchBookingTransferDocuments(booking, {
      assetTransferDocument: updates?.assetTransferDocument,
      successFee: updates.fees,
    })

    await booking.save()

    const session = await createSuccessFeeCheckoutSession(
      booking,
      asset,
      updates.fees,
      success_url,
    )

    const PaymentUrl = session?.url

    asset.transferDocuments.paymentUrl = PaymentUrl
    asset.markModified('transferDocuments')
    await asset.save()

    patchBookingTransferDocuments(booking, {
      paymentUrl: PaymentUrl,
    })
    await booking.save()

    const assetHolder = await resolveBookingAssetHolder(booking)
    const mailResult = await SendAssetTransferingMail({
      PaymentUrl,
      assetName:
        booking?.productData?.title ||
        booking?.productData?.assetType ||
        'Asset',
      AssetHolder: assetHolder,
      broker: booking?.brokerId,
    })

    res.status(200).json({
      success: true,
      message: mailResult?.success
        ? 'Ready to transfer asset document updated successfully'
        : 'Transfer document saved, but the payment email could not be sent.',
      emailSent: Boolean(mailResult?.success),
      mailError: mailResult?.success ? undefined : mailResult?.message,
      recipientEmail: mailResult?.recipientEmail || assetHolder?.email || null,
      PaymentUrl,
    })
    return
  } catch (error) {
    console.log({ error })
    res.status(500).json({ message: 'Server error', error: error?.message })
    return
  }
}

async function loadTrusteeTransferBooking(bookingId, requester) {
  if (!isTrusteeRole(requester?.role)) {
    const err = new Error('Only trustees can manage transfer submissions.')
    err.statusCode = 403
    throw err
  }

  const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
  const sanitizedId = sanitizeUUID(bookingId)
  if (!sanitizedId) {
    const err = new Error('Invalid booking id.')
    err.statusCode = 400
    throw err
  }

  const booking = await Booking.findOne({ uuid: sanitizedId, isDeleted: false })
    .populate({ path: 'brokerId', select: 'email name' })
    .populate({ path: 'assetHolderId', select: 'email name' })

  if (!booking) {
    const err = new Error('Booking not found')
    err.statusCode = 404
    throw err
  }

  const { asset } = await findAssetForBooking(booking)
  if (!asset) {
    const err = new Error('Asset not found')
    err.statusCode = 404
    throw err
  }

  return { booking, asset }
}

async function createSuccessFeeCheckoutSession(booking, asset, fees, success_url) {
  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'aed',
          product_data: {
            name: `Asset Transfer fees for ${booking?.productData?.assetType}`,
            description:
              booking?.productData?.title ||
              booking?.productData?.assetType ||
              'Asset',
            images: [booking?.productData?.thumbnailImg?.images?.[0]?.url],
          },
          unit_amount: Math.round(fees * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: success_url,
    metadata: {
      assetType: booking?.productData?.assetType || '',
      assetId: asset?._id?.toString() || booking?.productData?.uuid || '',
    },
  })
}

export const cancelTransferSubmission = async (req, res) => {
  try {
    const id = req.query.id
    if (!id) {
      return res.status(400).json({ message: 'Booking id is required in query params.' })
    }

    const { booking, asset } = await loadTrusteeTransferBooking(id, req.user)
    const transferDocuments = await resolveTransferDocumentsForBooking(booking)

    if (!transferDocuments?.assetTransferDocument) {
      return res.status(400).json({ message: 'No transfer submission to cancel.' })
    }

    if (transferDocuments?.PaymentProof) {
      return res.status(400).json({
        message: 'Cannot cancel after the seller has uploaded payment proof.',
      })
    }

    if (!asset.transferDocuments) asset.transferDocuments = {}
    asset.transferDocuments.assetTransferDocument = undefined
    asset.transferDocuments.successFee = undefined
    asset.transferDocuments.paymentUrl = undefined
    asset.markModified('transferDocuments')
    asset.successFeePaymentStatus = 'Pending'
    await asset.save()

    patchBookingTransferDocuments(booking, {
      assetTransferDocument: null,
      successFee: null,
      paymentUrl: null,
      PaymentProof: null,
    })
    patchBookingProductData(booking, { successFeePaymentStatus: 'Pending' })
    await booking.save()

    return res.status(200).json({
      success: true,
      message: 'Transfer submission cancelled. You can upload again.',
    })
  } catch (error) {
    const status = error?.statusCode || 500
    return res.status(status).json({
      success: false,
      message: error?.message || 'Server error',
    })
  }
}

export const resendTransferPaymentEmail = async (req, res) => {
  try {
    const id = req.query.id
    const success_url = req.body?.success_url || req.query.success_url

    if (!id) {
      return res.status(400).json({ message: 'Booking id is required in query params.' })
    }
    if (!success_url) {
      return res.status(400).json({ message: 'success_url is required.' })
    }

    const { booking, asset } = await loadTrusteeTransferBooking(id, req.user)
    const transferDocuments = await resolveTransferDocumentsForBooking(booking)

    if (!transferDocuments?.assetTransferDocument) {
      return res.status(400).json({
        message: 'Submit transfer documents and success fee before resending.',
      })
    }

    if (transferDocuments?.PaymentProof) {
      return res.status(400).json({
        message: 'Payment proof already received — resend is not available.',
      })
    }

    const fees = Number(transferDocuments.successFee)
    if (!Number.isFinite(fees) || fees <= 0) {
      return res.status(400).json({
        message:
          'Success fee is missing on this submission. Cancel and submit again with a valid fee.',
      })
    }

    const session = await createSuccessFeeCheckoutSession(
      booking,
      asset,
      fees,
      success_url,
    )
    const PaymentUrl = session?.url

    if (!asset.transferDocuments) asset.transferDocuments = {}
    asset.transferDocuments.paymentUrl = PaymentUrl
    asset.transferDocuments.successFee = fees
    asset.markModified('transferDocuments')
    await asset.save()

    patchBookingTransferDocuments(booking, {
      paymentUrl: PaymentUrl,
      successFee: fees,
    })
    await booking.save()

    const assetHolder = await resolveBookingAssetHolder(booking)
    const mailResult = await SendAssetTransferingMail({
      PaymentUrl,
      assetName:
        booking?.productData?.title ||
        booking?.productData?.assetType ||
        'Asset',
      AssetHolder: assetHolder,
      broker: booking?.brokerId,
    })

    return res.status(200).json({
      success: true,
      emailSent: Boolean(mailResult?.success),
      message: mailResult?.success
        ? 'Payment link resent to the seller by email.'
        : 'Could not send payment email. Copy the payment link manually.',
      mailError: mailResult?.success ? undefined : mailResult?.message,
      recipientEmail: mailResult?.recipientEmail || assetHolder?.email || null,
      PaymentUrl,
    })
  } catch (error) {
    const status = error?.statusCode || 500
    return res.status(status).json({
      success: false,
      message: error?.message || 'Server error',
    })
  }
}

export const AssetTransferProof = async (req, res) => {
  try {
    const bookingUUID = req.query.id
    const { PaymentProof } = req.body
    const requester = req.user

    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    if (!bookingUUID)
      return res.status(400).json({
        message: 'Booking UUID is required in query params.',
      })

    if (!PaymentProof)
      return res.status(400).json({
        message: 'Payment proof file is required.',
      })

    const booking = await Booking.findOne({
      uuid: bookingUUID,
      isDeleted: false,
    })
      .populate({ path: 'brokerId', select: 'email name uuid' })
      .populate({ path: 'assetHolderId', select: 'email name uuid' })

    if (!booking)
      return res.status(400).json({
        message: 'Booking not found.',
      })

    const requesterId = requester._id?.toString()
    const holderId = booking.assetHolderId?._id?.toString()
    const isAssetHolder =
      holderId === requesterId ||
      booking.assetHolderUUID === requester.uuid
    const isTrustee = isTrusteeRole(requester.role)

    if (!isAssetHolder && !isTrustee) {
      return res.status(403).json({
        message: 'Only the asset holder can upload the success fee invoice.',
      })
    }

    const { asset } = await findAssetForBooking(booking)

    if (!asset)
      return res.status(400).json({
        message: 'Asset not found.',
      })

    if (!asset.transferDocuments) asset.transferDocuments = {}
    asset.transferDocuments.PaymentProof = PaymentProof
    syncAssetTransactionOnPaymentProof(asset)
    await asset.save()

    patchBookingTransferDocuments(booking, {
      PaymentProof,
    })
    patchBookingProductData(booking, {
      successFeePaymentStatus: 'Paid',
    })
    await booking.save()

    try {
      await createNotification({
        data: {
          UserRole: 'Trustee',
          title: 'Success fee invoice uploaded',
          message: `The seller uploaded success fee payment proof for ${booking?.productData?.title || 'an asset'}.`,
          RelateRoute: 'Trustee',
          RelatedId: '/trustee/transaction',
        },
      })
    } catch (err) {
      console.log('Notification error =>', err.message)
    }

    return res.status(200).json({
      success: true,
      message: 'Success fee invoice uploaded successfully.',
    })
  } catch (error) {
    console.log('Server error:', error)
    return res.status(500).json({
      message: 'Server error',
      error: error?.message,
    })
  }
}

export const MarkAssetAsTransfered = async (req, res) => {
  try {
    const id = req.query.id

    if (!id)
      return res
        .status(400)
        .json({ message: 'Booking id is required is query params.' })

    const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
    const sanitizedId = sanitizeUUID(id)
    if (!sanitizedId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    const booking = await Booking.findOne({ uuid: sanitizedId, isDeleted: false })
      .populate({ path: 'brokerId', select: 'email name phoneNumber' })
      .populate({ path: 'assetHolderId', select: 'email name' })

    if (!booking) {
      return res.status(400).json({ message: 'Booking not found' })
    }

    const { asset } = await findAssetForBooking(booking)

    if (!asset) {
      return res.status(400).json({ message: 'Asset not found' })
    }

    syncAssetTransactionOnTransferComplete(
      asset,
      booking?.brokerId?._id,
      booking?.productData?.assetType,
    )
    await asset.save()

    patchBookingProductData(booking, {
      dealClosed: true,
      dealer: booking?.brokerId?._id,
      successFeePaymentStatus: 'Paid',
    })
    booking.status = 'completed'
    await booking.save()

    try {
      const NotificationData = {
        userId: booking?.assetHolderId?._id,
        userUUID: booking?.assetHolderId?.uuid,
        UserRole: 'AssetHolder',
        title: 'Asset Sold',
        message: `Your asset (${booking?.productData?.title || ''
          }) is marked as sold.`,
        RelateRoute: 'property',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json({ message: 'Asset marked as transfered' })
    return
  } catch (error) {
    console.log({ error })
    res.status(500).json({ message: 'Server error', error })
    return
  }
}

export const toggleBookingUnderProcess = async (req, res) => {
  try {
    const requester = req.user
    const normalizedRole = String(requester?.role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-_]/g, '')

    if (normalizedRole !== 'trustee') {
      return res.status(403).json({
        message: 'Only trustees can update under process status.',
      })
    }

    const { bookingId } = req.params
    const underProcess = Boolean(req.body?.underProcess)

    const booking = await toggleBookingUnderProcessService(
      bookingId,
      underProcess,
    )

    try {
      const assetHolderUUID =
        booking?.assetHolderUUID || booking?.productData?.userUUID
      if (assetHolderUUID) {
        await createNotification({
          data: {
            userUUID: assetHolderUUID,
            UserRole: 'AssetHolder',
            title: underProcess ? 'Under process' : 'Asset open',
            message: underProcess
              ? 'A buyer is in talks for your asset. Price editing is temporarily disabled.'
              : 'Your asset is no longer under process. You can update the price again.',
            RelateRoute: 'my-listing',
            RelatedUUID: booking?.productData?.uuid,
          },
        })
      }
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json({
      message: underProcess
        ? 'Marked as under process'
        : 'Marked as open',
      booking,
    })
  } catch (error) {
    const statusCode = error?.message === 'Booking not found' ? 404 : 500
    res.status(statusCode).json({ message: error.message })
  }
}

const isTrusteeRole = (role) =>
  String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-_]/g, '') === 'trustee'

export const getTransactionBookings = async (req, res) => {
  try {
    const requester = req.user
    if (!isTrusteeRole(requester?.role)) {
      return res.status(403).json({
        message: 'Only trustees can access transaction management.',
      })
    }

    const transactions = await getTransactionBookingsService()
    res.status(200).json(transactions)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateTrusteeDeposit = async (req, res) => {
  try {
    const requester = req.user
    if (!isTrusteeRole(requester?.role)) {
      return res.status(403).json({
        message: 'Only trustees can update deposit records.',
      })
    }

    const { bookingId } = req.params
    const { transactionDepositDocument, trusteeNote } = req.body

    if (!transactionDepositDocument && trusteeNote === undefined) {
      return res.status(400).json({
        message: 'Deposit document or trustee note is required.',
      })
    }

    const result = await updateTrusteeDepositService(bookingId, {
      transactionDepositDocument,
      trusteeNote,
    })

    res.status(200).json({
      message: 'Deposit record updated successfully.',
      bookingUuid: result.booking.uuid,
    })
  } catch (error) {
    const statusCode =
      error?.message === 'Booking not found' ||
        error?.message === 'Asset not found'
        ? 404
        : 500
    res.status(statusCode).json({ message: error.message })
  }
}
