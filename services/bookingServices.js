import Slot from '../models/Slot.js'
import Booking from '../models/Booking.js'
import { Types } from 'mongoose'
import User from '../models/userModel.js'
import { createNotification } from '../controller/notifications.controller.js'
import { refreshListingMediaSignedUrls } from '../helper/refreshAssetSignedUrls.js'
import moment from 'moment'

export const VIEWING_SLOT_CATEGORY = 'viewing'
export const SERVICE_SLOT_CATEGORY = 'service'

export const roleToSlotCategory = (role = '') => {
  const normalized = String(role).trim().toLowerCase().replace(/[\s_-]/g, '')
  if (normalized === 'trustee') return VIEWING_SLOT_CATEGORY
  return SERVICE_SLOT_CATEGORY
}

const buildDateRange = (date) => {
  const parsedDate = moment(date)
  if (!parsedDate.isValid()) return null
  return {
    $gte: parsedDate.clone().startOf('day').toDate(),
    $lte: parsedDate.clone().endOf('day').toDate(),
  }
}

const buildSlotCategoryClause = async (userUUID, slotCategory) => {
  const user = await User.findOne({ uuid: userUUID, isDeleted: false }).select(
    'role uuid',
  )
  if (!user) return null

  const inferred = roleToSlotCategory(user.role)

  if (slotCategory === VIEWING_SLOT_CATEGORY) {
    if (inferred !== VIEWING_SLOT_CATEGORY) return null
    return {
      $or: [
        { slotCategory: VIEWING_SLOT_CATEGORY },
        { slotCategory: { $exists: false } },
      ],
    }
  }

  return {
    $or: [
      { slotCategory: SERVICE_SLOT_CATEGORY },
      {
        slotCategory: { $exists: false },
        creatorRole: { $ne: 'Trustee' },
      },
      {
        slotCategory: { $exists: false },
        creatorRole: { $exists: false },
      },
    ],
  }
}

// Fetch available slots
export const getAvailableSlotsService = async (date) => {
  const selectedDate = new Date(date)
  return Slot.find({
    date: selectedDate,
    'times.isBooked': false,
    isDeleted: false,
  })
}

// Create a new booking
export const createBookingService = async (bookingData) => {
  const { brokerId, assetHolderId, message, timeSlotId, productData } =
    bookingData
  console.log(timeSlotId)

  if (!timeSlotId) throw new Error('timeSlotId is required')
  if (!brokerId) throw new Error('brokerId is required')
  if (!assetHolderId) throw new Error('assetHolderId is required')
  if (!productData) throw new Error('productData is required')

  const resolveIdentifier = (value) => {
    if (!value) return ''
    if (typeof value === 'string' && value !== '[object Object]') {
      return value.trim()
    }
    if (typeof value === 'object') {
      return (
        value.uuid ||
        value.userUUID ||
        value.id ||
        value._id?.toString?.() ||
        ''
      )
    }
    return ''
  }

  const normalizedBrokerId = resolveIdentifier(brokerId)
  const normalizedAssetHolderId =
    resolveIdentifier(assetHolderId) ||
    resolveIdentifier(productData?.userUUID) ||
    resolveIdentifier(productData?.userId)

  const slot = await Slot.findOne({
    'times.uuid': timeSlotId,
    'times.isBooked': false,
    isDeleted: false,
  })
  if (!slot) throw new Error('Time slot not available')

  if (slot.slotCategory === SERVICE_SLOT_CATEGORY) {
    throw new Error('This time slot is not available for property viewing')
  }

  const slotOwner = await User.findOne({
    uuid: slot.userUUID,
    isDeleted: false,
  }).select('role')

  if (roleToSlotCategory(slotOwner?.role) !== VIEWING_SLOT_CATEGORY) {
    throw new Error('This time slot is not available for property viewing')
  }

  // Ensure broker exists
  const brokerQuery = { isDeleted: false, $or: [{ uuid: normalizedBrokerId }] }
  if (Types.ObjectId.isValid(normalizedBrokerId)) {
    brokerQuery.$or.push({ _id: normalizedBrokerId })
  }
  const broker = await User.findOne(brokerQuery)
  if (!broker) throw new Error('Broker not found')

  // Ensure asset holder exists
  let assetHolder = null
  if (normalizedAssetHolderId) {
    const assetHolderQuery = {
      isDeleted: false,
      $or: [{ uuid: normalizedAssetHolderId }],
    }
    if (Types.ObjectId.isValid(normalizedAssetHolderId)) {
      assetHolderQuery.$or.push({ _id: normalizedAssetHolderId })
    }
    assetHolder = await User.findOne(assetHolderQuery)
  }

  // Mark the time slot as booked
  await Slot.updateOne(
    { 'times.uuid': timeSlotId, isDeleted: false },
    { $set: { 'times.$.isBooked': true } }
  )

  if (!slot || !slot.times || slot.times.length === 0) {
    throw new Error('Time slot not found')
  }

  const matchedTimeSlot = slot.times.find((time) => time.uuid === timeSlotId)
  if (!matchedTimeSlot) throw new Error('Time slot not found')
  const timeSlotObjectId = matchedTimeSlot._id

  // Create booking with productData and timeSlotId
  const booking = await Booking.create({
    slotId: slot._id,
    timeSlotId: timeSlotObjectId,
    timeSlotUUID: timeSlotId,
    assetHolderId: assetHolder?._id,
    assetHolderUUID: normalizedAssetHolderId,
    brokerId: broker._id,
    brokerUUID: normalizedBrokerId,
    message,
    productData,
  })

  try {
    const NotificationData = {
      userUUID: brokerId,
      UserRole: 'Trustee',
      title: 'Booking',
      message: `A new booking for trustee added.`,
      RelateRoute: 'Trustee',
      RelatedId: booking?._id,
      RelatedUUID: booking?.uuid,
    }
    await createNotification({ data: NotificationData })
  } catch (error) {
    console.log({ error: error?.message })
  }

  return { booking, broker }
}

// Add a new slot with time slots
export const addSlotService = async (date, timeSlots, userUUID, metadata = {}) => {
  const slotCategory = metadata.slotCategory || SERVICE_SLOT_CATEGORY
  const creatorRole = metadata.creatorRole || ''

  const existingSlot = await Slot.findOne({
    date,
    userUUID,
    slotCategory,
    isDeleted: false,
  })

  // If the slot already exists, return an error
  if (existingSlot) {
    throw new Error('A slot with this date already exists.')
  }

  // If no existing slot is found, proceed with slot creation
  const newSlot = new Slot({
    userUUID,
    date,
    slotCategory,
    creatorRole,
    times: timeSlots.map((time) => ({ time })),
  })
  return newSlot.save()
}

// Update slot
export const updateSlotService = async (timeSlotId, isBooked) => {
  return Slot.updateOne(
    { 'times._id': timeSlotId },
    { $set: { 'times.$.isBooked': isBooked } }
  )
}

// Update all/seleted slot
export const updateSeletedSlotService = async (slotId, newTimeSlot) => {
  return Slot.findByIdAndUpdate(
    slotId,
    { $addToSet: { times: newTimeSlot } },
    { new: true }
  )
}

// Delete slot
export const deleteSlotService = async (slotId) => {
  const slot = await Slot.findOne({ uuid: slotId, isDeleted: false })

  if (!slot || slot.isDeleted) {
    throw new Error('Slot not found or already deleted')
  }

  // Soft delete
  slot.isDeleted = true
  slot.deletedAt = new Date()
  await slot.save()

  // Send notification
  try {
    const NotificationData = {
      userId: slot.userId,
      userUUID: slot.userUUID,
      UserRole: 'Trustee',
      title: 'Slot Deleted',
      message: `A slot has been deleted.`,
      RelateRoute: 'Trustee',
    }
    await createNotification({ data: NotificationData })
  } catch (error) {
    console.log({ error: error?.message })
  }

  return slot
}

// Get all slots
export const getAllSlotsService = async (id, role) => {
  const slotCategory = roleToSlotCategory(role)
  const categoryClause = await buildSlotCategoryClause(id, slotCategory)

  const baseQuery = { isDeleted: false }
  if (categoryClause) {
    Object.assign(baseQuery, categoryClause)
  }

  if (role === 'Admin') {
    return Slot.find({ isDeleted: false }).sort({ createdAt: -1 })
  }

  return Slot.find({ userUUID: id, ...baseQuery }).sort({ createdAt: -1 })
}

// Get all bookings
export const getAllBookingsService = async (userId, userRole, userUUID) => {
  try {
    let query = {}
    const normalizedRole = (userRole || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-_]/g, '')

    // Admin / Super Admin / Trustee can see all bookings.
    // AssetHolder and Broker are filtered to their own bookings.
    const elevated =
      normalizedRole === 'admin' ||
      normalizedRole === 'superadmin' ||
      normalizedRole === 'trustee'
    if (!elevated) {
      if (normalizedRole === 'broker') {
        query.$or = []
        if (userId) query.$or.push({ brokerId: userId })
        if (userUUID) query.$or.push({ brokerUUID: userUUID })
      } else {
        query.$or = []
        if (userId) query.$or.push({ assetHolderId: userId })
        if (userUUID) query.$or.push({ assetHolderUUID: userUUID })
      }

      if (!query.$or.length) {
        return []
      }
    }
    query.isDeleted = false
    const bookings = await Booking.find(query)
      .populate({
        path: 'slotId',
        select: 'date times -_id', // only get date + times
      })
      .populate({
        path: 'brokerId',
        select: 'name email -_id',
      })
      .select(
        '-_id -productData -assetHolderId -timeSlotId -timeSlotUUID -assetHolderUUID -brokerUUID'
      )
      .lean()

    const populatedBookings = bookings.map((booking) => {
      const timeSlot = booking?.slotId?.times?.find(
        (time) => time.uuid === booking.timeSlotUUID
      )

      const date = booking?.slotId?.date

      // Remove slotId from return object
      const { slotId, ...rest } = booking

      return {
        ...rest,
        date,
        timeSlot,
      }
    })

    return populatedBookings
  } catch (err) {
    console.error('Error fetching bookings:', err)
    throw new Error('Unable to fetch bookings')
  }
}

// Get booking by ID

export const getBookingByIdService = async (bookingId) => {
  // Get booking with relational users & slot
  const booking = await Booking.findOne({ uuid: bookingId, isDeleted: false })
    .populate({
      path: 'slotId',
      select: 'date times',
    })
    .populate({
      path: 'brokerId',
      select: 'name email phoneNumber id',
    })
    .populate({
      path: 'assetHolderId',
      select: 'name email id',
    })
    .lean()

  if (!booking) return null

  // Snapshotted listing media carries expiring CloudFront signatures; refresh
  // from stored s3Key so viewing details always get working image URLs.
  if (booking.productData && typeof booking.productData === 'object') {
    try {
      await refreshListingMediaSignedUrls(booking.productData)
    } catch (err) {
      console.warn(
        'getBookingByIdService: refreshListingMediaSignedUrls failed',
        err?.message,
      )
    }
  }

  // extract timeSlot data
  const timeSlot = booking.slotId?.times?.find(
    (t) => t.uuid === booking.timeSlotUUID
  )

  // Extract common fields
  const productCommon = {
    uuid: booking.productData?.uuid,
    title: booking.productData?.title,
    phoneNumber: booking.productData?.phoneNumber,
    price: booking.productData?.price,
    pictures: booking.productData?.pictures,
    thumbnailImg: booking.productData?.thumbnailImg,
  }

  // Extract asset-specific fields
  const assetType = booking.productData?.assetType
  let assetFields = []

  switch (assetType) {
    case 'Property For Sale':
    case 'Property For Lease':
    case 'Property Off Plan For Sale':
      assetFields = [
        { label: 'Size in sq feet', value: booking.productData?.sizeSQFT },
        { label: 'Bedrooms', value: booking.productData?.bedrooms },
        { label: 'Bathrooms', value: booking.productData?.bathrooms },
        { label: 'Developer', value: booking.productData?.developer },
        {
          label: 'Is it Furnished',
          value: booking.productData?.isFurnished ? 'Yes' : 'No',
        },
        {
          label: 'Occupancy Status',
          value: booking.productData?.occupancyStatus,
        },
      ]
      break

    case 'Car For Sale':
      assetFields = [
        { label: 'Make', value: booking.productData?.make },
        { label: 'Model', value: booking.productData?.model },
        { label: 'Year', value: booking.productData?.year },
        { label: 'Kilometers', value: booking.productData?.kilometers },
        { label: 'Seats', value: booking.productData?.seats },
        { label: 'Doors', value: booking.productData?.doors },
        {
          label: 'Body Condition',
          value: booking.productData?.bodyCondition,
        },
        { label: 'Warranty', value: booking.productData?.warranty },
        { label: 'Fuel Type', value: booking.productData?.fuelType },
        {
          label: 'No Of Cylinders',
          value: booking.productData?.noofCylinders,
        },
      ]
      break

    case 'Boats For Sale':
      assetFields = [
        { label: 'Length', value: booking.productData?.length },
        { label: 'Condition', value: booking.productData?.condition },
        { label: 'Age', value: booking.productData?.age },
        { label: 'Usage', value: booking.productData?.usage },
        { label: 'Seats', value: booking.productData?.seats },
      ]
      break

    case 'Jewellery For Sale':
      assetFields = [
        {
          label: 'Metal Material',
          value: booking.productData?.jewelryMetal,
        },
        {
          label: 'Grams',
          value: booking.productData?.grams,
        },
        { label: 'Condition', value: booking.productData?.condition },
        { label: 'Age', value: booking.productData?.age },
      ]
      break
  }

  return {
    uuid: booking.uuid,
    message: booking.message,
    comment: booking.comment,
    date: booking.slotId?.date,
    time: timeSlot?.time,
    brokerId: booking.brokerId,
    assetHolder: booking.assetHolderId,
    productData: {
      ...productCommon,
      fields: assetFields,
    },
  }
}

// Get booking by ID
export const getBookingByIdAssetValue = async (assetId) => {
  try {
    const booking = await Booking.findOne({
      assetId: new Types.ObjectId(assetId), // Use parameter
      isDeleted: false,
    })
      .populate('slotId')
      .populate('brokerId')
      .populate('assetHolderId')
      .populate('timeSlotId')

    if (!booking) {
      return null
    }

    const timeSlot = booking?.slotId?.times?.find((time) =>
      time._id.equals(booking.timeSlotId)
    )

    return { ...booking.toObject(), timeSlot }
  } catch (error) {
    console.error('Error fetching booking:', error.message)
    throw error
  }
}

// Delete booking by UUID and release the selected timeslot
export const deleteBookingByIdService = async (bookingUUID) => {
  const booking = await Booking.findOne({ uuid: bookingUUID, isDeleted: false })
  if (!booking) {
    throw new Error('Booking not found')
  }

  // Release the time slot so it can be booked again
  if (booking.timeSlotUUID) {
    await Slot.updateOne(
      { _id: booking.slotId, 'times.uuid': booking.timeSlotUUID, isDeleted: false },
      { $set: { 'times.$.isBooked': false } }
    )
  }

  booking.isDeleted = true
  booking.deletedAt = new Date()
  await booking.save()

  return booking
}

// Get available slots by date (arrange viewing uses slotCategory=viewing)
export const getAvailableSlotsByDateService = async (
  date,
  userUUID,
  slotCategory = VIEWING_SLOT_CATEGORY,
) => {
  if (!userUUID || !date) return []

  const dateRange = buildDateRange(date)
  if (!dateRange) return []

  const categoryClause = await buildSlotCategoryClause(userUUID, slotCategory)
  if (!categoryClause) return []

  return Slot.find({
    userUUID,
    date: dateRange,
    isDeleted: false,
    ...categoryClause,
  }).select('-_id -createdAt -isDeleted -deletedAt')
}

export const getSlotsByDateService = async (
  date,
  userUUID,
  slotCategory = SERVICE_SLOT_CATEGORY,
) => {
  if (!userUUID || !date) return []

  const dateRange = buildDateRange(date)
  if (!dateRange) return []

  const categoryClause = await buildSlotCategoryClause(userUUID, slotCategory)
  if (!categoryClause) return []

  return Slot.find({
    userUUID,
    date: dateRange,
    isDeleted: false,
    ...categoryClause,
  })
    .select('-_id -createdAt -isDeleted -deletedAt')
    .lean()
}
