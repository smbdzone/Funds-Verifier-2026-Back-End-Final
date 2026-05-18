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
} from '../services/bookingServices.js'
import moment from 'moment'
import { createNotification } from './notifications.controller.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import { stripe } from '../libs/stripe.js'
import SendAssetTransferingMail from '../utils/asset-transfer/SendAssetTransferingMail.js'

const GetAssetName = (assetType = '') => {
  const type = assetType.toLowerCase()
  if (type.includes('car')) return Car
  if (type.includes('property')) return Property
  if (type.includes('jewel')) return Jewelry
  if (type.includes('boat')) return Boat
  return Property
}

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
    ]
    const statusCode = knownClientErrors.includes(error?.message) ? 400 : 500
    res.status(statusCode).json({ message: error.message })
  }
}

// Add slot
export const addSlot = async (req, res) => {
  try {
    const { date, timeSlots, userUUID } = req.body

    const slot = await addSlotService(date, timeSlots, userUUID)
    res.status(201).json({ message: 'Slot added', slot })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getSlotsByDate = async (req, res) => {
  try {
    const { date, userUUID } = req.query
    console.log(date, userUUID)

    if (!date) {
      return res.status(400).json({ error: 'Date is required.' })
    }

    // Validate and parse the date
    const parsedDate = moment(date) // Strict ISO 8601 parsing
    if (!parsedDate.isValid()) {
      return res.status(400).json({ error: 'Invalid date format.' })
    }

    // Generate start and end of the day for the given date
    const startOfDay = parsedDate.startOf('day').toISOString()
    const endOfDay = parsedDate.endOf('day').toISOString()

    // Query for slots within the day's range and role
    const slots = await Slot.find(
      {
        date: { $gte: startOfDay, $lte: endOfDay },
        userUUID: userUUID,
        isDeleted: false,
        // userId,
      },
      { 'times._id': 0 }
    ).select('-_id -createdAt -isDeleted -deletedAt')

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
    console.log(slotId);

    await deleteSlotService(slotId)
    res.status(200).json({ message: 'Slot deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
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

    const bookings = await getAllBookingsService(userId, userRole, userUUID)
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
    const { date, userId } = req.query

    const availableSlots = await getAvailableSlotsByDateService(date, userId)
    res.status(200).json(availableSlots)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateViewingById = async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    // console.log({ id })

    const updatedBooking = await Booking.findOneAndUpdate(
      { userUUID: id, isDeleted: false },
      updates,
      {
        new: true,
      }
    )

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found' })
    }

    try {
      const NotificationData = {
        userId: updatedBooking?.brokerId,
        userUUID: id,
        UserRole: 'Trustee',
        title: 'Booking',
        message: `A booking has been updated.`,
        RelateRoute: 'Trustee',
        RelatedId: updatedBooking?._id,
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
      updates.fees == Number(updates?.fees || 10)
    }
    if (!updates?.success_url) {
      return res
        .status(400)
        .json({ message: 'Asset transfer success url is required.' })
    }
    const success_url = updates?.success_url

    const booking = await Booking.findById(id, { isDeleted: false })
      .populate({ path: 'brokerId', select: 'email name' })
      .populate({ path: 'assetHolderId', select: 'email name' })

    if (!booking) {
      return res.status(400).json({ message: 'Booking not found' })
    }
    // console.log('AssetType:', booking?.productData?.assetType)
    // console.log('AssetID:', booking?.productData?._id)

    const AssetModel = GetAssetName(booking?.productData?.assetType)
    const asset = await AssetModel.findById(booking?.productData?._id, {
      isDeleted: false,
    })

    asset.transferDocuments.assetTransferDocument =
      updates?.assetTransferDocument
    asset.save()
    // save in bookings
    booking.productData = booking.productData || {}
    booking.productData.transferDocuments =
      booking.productData.transferDocuments || {}

    booking.productData.transferDocuments.assetTransferDocument =
      updates?.assetTransferDocument

    await booking.save()

    const session = await stripe.checkout.sessions.create({
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
            unit_amount: updates?.fees * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: success_url,
      metadata: {
        assetType: booking?.productData?.assetType || '',
        assetId: booking?.productData?._id?.toString() || '',
      },
    })

    const PaymentUrl = session?.url

    await SendAssetTransferingMail({
      PaymentUrl,
      assetName:
        booking?.productData?.title ||
        booking?.productData?.assetType ||
        'Asset',
      AssetHolder: booking?.assetHolderId,
      broker: booking?.brokerId,
    })

    // try {
    //   const NotificationData = {
    //     userId: updatedBooking?.brokerId,
    //     UserRole: "Trustee",
    //     title: "Booking",
    //     message: `A booking has been updated.`,
    //     RelateRoute: "Trustee",
    //     RelatedId: updatedBooking?._id
    //   }
    //   await createNotification({ data: NotificationData })
    // } catch (error) {
    //   console.log({ error: error?.message });
    // }

    res.status(200).json({
      message: 'Ready to transfer asset document updated successfully',
      PaymentUrl,
    })
    return
  } catch (error) {
    console.log({ error })
    res.status(500).json({ message: 'Server error', error })
    return
  }
}

export const AssetTransferProof = async (req, res) => {
  try {
    const bookingUUID = req.query.id
    const { PaymentProof } = req.body

    if (!bookingUUID)
      return res.status(400).json({
        message: 'Booking UUID is required in query params.',
      })

    if (!PaymentProof)
      return res.status(400).json({
        message: 'Payment Proof file is required.',
      })

    // Fetch booking
    const booking = await Booking.findOne({
      uuid: bookingUUID,
      isDeleted: false,
    })
      .populate({ path: 'brokerId', select: 'email name' })
      .populate({ path: 'assetHolderId', select: 'email name' })

    if (!booking)
      return res.status(400).json({
        message: 'Booking not found.',
      })

    // Get relevant asset model
    const AssetModel = GetAssetName(booking?.productData?.assetType)

    // Fetch asset by id stored in booking
    const asset = await AssetModel.findOne({
      uuid: booking?.productData?.uuid,
      isDeleted: false,
    })

    if (!asset)
      return res.status(400).json({
        message: 'Asset not found.',
      })

    // --- UPDATE ASSET ---
    if (!asset.transferDocuments) asset.transferDocuments = {}
    asset.transferDocuments.PaymentProof = PaymentProof
    await asset.save()

    // --- UPDATE BOOKING ---
    if (!booking.productData.transferDocuments)
      booking.productData.transferDocuments = {}

    booking.productData.transferDocuments.PaymentProof = PaymentProof
    await booking.save()

    // --- CREATE NOTIFICATION ---
    try {
      await createNotification({
        data: {
          userId: booking?._id, // receiver
          userUUID: booking?.uuid,
          UserRole: 'Trustee',
          title: 'Payment Proof Submitted',
          message: `Payment proof uploaded for asset.`,
          RelateRoute: 'Trustee',
          RelatedId: '/trustee',
        },
      })
    } catch (err) {
      console.log('Notification error =>', err.message)
    }

    return res.status(200).json({
      success: true,
      message: 'Payment proof uploaded successfully.',
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

    const AssetModel = GetAssetName(booking?.productData?.assetType)
    const asset = await AssetModel.findById(booking?.productData?._id, {
      isDeleted: false,
    })
    asset.dealClosed = true
    asset.dealer = booking?.brokerId?._id
    asset.save()

    // save in bookings
    booking.productData.dealClosed = true
    booking.productData.dealer = booking?.brokerId?._id
    booking.save()

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
