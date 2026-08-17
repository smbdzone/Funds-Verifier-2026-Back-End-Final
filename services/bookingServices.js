import Slot from '../models/Slot.js'
import Booking from '../models/Booking.js'
import { Types } from 'mongoose'
import User from '../models/userModel.js'
import { createNotification } from '../controller/notifications.controller.js'
import { refreshListingMediaSignedUrls } from '../helper/refreshAssetSignedUrls.js'
import moment from 'moment'
import {
  syncListingUnderProcessFlag,
} from '../utils/listingUnderProcess.js'
import {
  deriveTransactionPhase,
  findAssetForBooking,
  isTransactionBooking,
  resolveTransferDocumentsForBooking,
} from '../utils/transactionBooking.js'
import { notifyAssetHolderViewingBooked } from '../helper/notifyAssetHolderViewingBooked.js'
import sendTrusteeViewingBookedEmail from '../utils/trusteeViewingMail.js'

export const VIEWING_SLOT_CATEGORY = 'viewing'
export const SERVICE_SLOT_CATEGORY = 'service'

function formatBedBathForBooking(value) {
  if (value === '' || value == null) return ''
  if (Number(value) === 0) return 'Studio'
  return String(value)
}

function formatFurnishedForBooking(value) {
  if (value === '' || value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const s = String(value).trim()
  if (!s) return ''
  if (/^(yes|furnished)$/i.test(s)) return 'Yes'
  if (/^(no|unfurnished)$/i.test(s)) return 'No'
  return s
}

function formatSizeForBooking(listing = {}) {
  const unit = String(listing.sizeUnit || listing.sizeType || 'SQFT').toUpperCase()
  const from =
    unit === 'SQM'
      ? listing.sizeSQMFrom ?? listing.sizeSQFTFrom
      : listing.sizeSQFTFrom ?? listing.sizeSQMFrom
  const to =
    unit === 'SQM'
      ? listing.sizeSQMTo ?? listing.sizeSQFTTo
      : listing.sizeSQFTTo ?? listing.sizeSQMTo
  if ((from != null && from !== '') || (to != null && to !== '')) {
    if (
      from != null &&
      from !== '' &&
      to != null &&
      to !== '' &&
      String(from) !== String(to)
    ) {
      return `${from} - ${to} ${unit}`
    }
    return `${from || to} ${unit}`
  }
  if (listing.sizeSQFT != null && listing.sizeSQFT !== '') {
    return `${listing.sizeSQFT} SQFT`
  }
  if (listing.sizeSQM != null && listing.sizeSQM !== '') {
    return `${listing.sizeSQM} SQM`
  }
  return ''
}

function formatAmenitiesList(listing = {}) {
  const type = String(listing.assetType || '').toLowerCase()
  const buckets = []
  if (type.includes('car')) {
    buckets.push(listing.technicalFeatures, listing.extras, listing.amenities)
  } else if (type.includes('boat')) {
    buckets.push(listing.extras, listing.amenities)
  } else if (type.includes('jewel')) {
    buckets.push(listing.materials, listing.amenities)
  } else {
    buckets.push(listing.facilities, listing.amenities)
  }
  const out = []
  for (const value of buckets) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        const s =
          typeof item === 'object'
            ? String(item?.name || item?.label || item?.title || '').trim()
            : String(item).trim()
        if (s) out.push(s)
      }
    } else if (typeof value === 'string') {
      for (const part of value.split(/[,|]/)) {
        const s = part.trim()
        if (s) out.push(s)
      }
    }
  }
  return [...new Set(out)]
}

function formatPriceForBooking(listing = {}) {
  const from = listing.priceFrom ?? listing.price
  const to = listing.priceTo
  if (from != null && to != null && String(from) !== String(to)) {
    return `${from} - ${to}`
  }
  if (from != null && from !== '') return String(from)
  if (listing.price != null && listing.price !== '') return String(listing.price)
  return ''
}

function formatListValue(value) {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'object') {
          return String(item.name || item.label || item.title || '').trim()
        }
        return String(item).trim()
      })
      .filter(Boolean)
      .join(', ')
  }
  return String(value)
}

function classifyAssetType(assetType = '') {
  const type = String(assetType || '').toLowerCase()
  if (type.includes('car')) return 'car'
  if (type.includes('boat')) return 'boat'
  if (type.includes('jewel')) return 'jewelry'
  if (type.includes('off plan') || type.includes('offplan')) return 'offplan'
  if (type.includes('lease')) return 'lease'
  if (type.includes('property')) return 'property'
  return 'property'
}

/** Snapshot of listing fields stored on the booking (safe, compact). */
function buildListingSnapshotFromAsset(asset, fallback = {}) {
  if (!asset) return { ...fallback }
  const lean = typeof asset.toObject === 'function' ? asset.toObject() : asset
  return {
    ...fallback,
    uuid: lean.uuid || fallback.uuid,
    slug: lean.slug || fallback.slug,
    title: lean.title || fallback.title,
    assetType: lean.assetType || fallback.assetType,
    userUUID: lean.userUUID || fallback.userUUID,
    neighbourhood: lean.neighbourhood || fallback.neighbourhood,
    city: lean.city || fallback.city,
    country: lean.country || fallback.country,
    mapUrl: lean.mapUrl || fallback.mapUrl,
    phoneNumber: lean.phoneNumber || fallback.phoneNumber,
    price: lean.price ?? lean.priceFrom ?? fallback.price,
    priceFrom: lean.priceFrom ?? fallback.priceFrom,
    priceTo: lean.priceTo ?? fallback.priceTo,
    developer: lean.developer || fallback.developer,
    propertyType: lean.propertyType || fallback.propertyType,
    layout: lean.layout,
    sizeSQFT: lean.sizeSQFT,
    sizeSQM: lean.sizeSQM,
    sizeSQFTFrom: lean.sizeSQFTFrom,
    sizeSQFTTo: lean.sizeSQFTTo,
    sizeSQMFrom: lean.sizeSQMFrom,
    sizeSQMTo: lean.sizeSQMTo,
    sizeUnit: lean.sizeUnit || lean.sizeType,
    sizeType: lean.sizeType || lean.sizeUnit,
    bedrooms: lean.bedrooms,
    bathrooms: lean.bathrooms,
    isFurnished: lean.isFurnished,
    occupancyStatus: lean.occupancyStatus,
    propertyDescription: lean.propertyDescription || lean.description,
    description: lean.description || lean.propertyDescription,
    additionalDescription: lean.additionalDescription,
    deliveryQuarter: lean.deliveryQuarter,
    deliveryYear: lean.deliveryYear,
    paymentPlanType: lean.paymentPlanType,
    leaseNumberofCheques: lean.leaseNumberofCheques,
    roi: lean.roi,
    facilities: lean.facilities,
    amenities: lean.amenities,
    technicalFeatures: lean.technicalFeatures,
    extras: lean.extras,
    materials: lean.materials,
    pictures: lean.pictures || fallback.pictures,
    thumbnailImg: lean.thumbnailImg || fallback.thumbnailImg,
    video: lean.video || fallback.video,
    qrScan: lean.qrScan || fallback.qrScan,
    make: lean.make,
    model: lean.model,
    year: lean.year,
    kilometers: lean.kilometers,
    seats: lean.seats,
    doors: lean.doors,
    bodyCondition: lean.bodyCondition,
    mechanicalCondition: lean.mechanicalCondition,
    warranty: lean.warranty,
    fuelType: lean.fuelType,
    noofCylinders: lean.noofCylinders,
    horsepower: lean.horsepower,
    steeringSide: lean.steeringSide,
    transmissionType: lean.transmissionType,
    engineCapacity: lean.engineCapacity,
    carType: lean.carType,
    category: lean.category,
    exteriorColor: lean.exteriorColor,
    interiorColor: lean.interiorColor,
    length: lean.length,
    weight: lean.weight,
    brands: lean.brands,
    condition: lean.condition,
    age: lean.age,
    usage: lean.usage,
    jewelryMetal: lean.jewelryMetal,
    jewelryStyles: lean.jewelryStyles,
    grams: lean.grams,
    sellerType: lean.sellerType,
  }
}

async function loadPopulatedListingForBooking(booking) {
  const { asset } = await findAssetForBooking(booking)
  if (!asset) return null
  try {
    await asset.populate([
      { path: 'pictures' },
      { path: 'thumbnailImg' },
      { path: 'video' },
      { path: 'qrScan' },
    ])
  } catch (err) {
    console.warn(
      'loadPopulatedListingForBooking: populate failed',
      err?.message,
    )
  }
  const obj = asset.toObject ? asset.toObject() : asset
  try {
    await refreshListingMediaSignedUrls(obj)
  } catch (err) {
    console.warn(
      'loadPopulatedListingForBooking: refreshListingMediaSignedUrls failed',
      err?.message,
    )
  }
  return obj
}

export const roleToSlotCategory = (role = '') => {
  const normalized = String(role).trim().toLowerCase().replace(/[\s_-]/g, '')
  if (normalized === 'trustee') return VIEWING_SLOT_CATEGORY
  if (normalized === 'assetholder' || normalized === 'dealhunter') {
    return VIEWING_SLOT_CATEGORY
  }
  return SERVICE_SLOT_CATEGORY
}

/** Slots are stored as UTC midnight from YYYY-MM-DD — query the same UTC day. */
const buildDateRange = (date) => {
  if (!date) return null
  const day = String(date).trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return {
      $gte: new Date(`${day}T00:00:00.000Z`),
      $lte: new Date(`${day}T23:59:59.999Z`),
    }
  }
  const parsedDate = moment.utc(date)
  if (!parsedDate.isValid()) return null
  return {
    $gte: parsedDate.clone().startOf('day').toDate(),
    $lte: parsedDate.clone().endOf('day').toDate(),
  }
}

/** Include docs created before isDeleted existed. */
const notDeletedClause = {
  $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
}

const buildSlotCategoryClause = async (userUUID, slotCategory) => {
  const user = await User.findOne({ uuid: userUUID, isDeleted: false }).select(
    'role uuid',
  )
  if (!user) return null

  const inferred = roleToSlotCategory(user.role)
  const normalizedRole = String(user.role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  const canOwnViewing =
    inferred === VIEWING_SLOT_CATEGORY ||
    normalizedRole === 'assetholder' ||
    normalizedRole === 'dealhunter' ||
    normalizedRole === 'trustee'

  if (slotCategory === VIEWING_SLOT_CATEGORY) {
    if (!canOwnViewing) return null
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
  if (!productData) throw new Error('productData is required')

  const resolveIdentifier = (value) => {
    if (!value) return ''
    if (typeof value === 'string' && value !== '[object Object]') {
      const trimmed = value.trim()
      if (trimmed === 'undefined' || trimmed === 'null') return ''
      return trimmed
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
  let normalizedAssetHolderId =
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
  }).select('role uuid name email')

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

  // Ensure asset holder exists — fall back to listing owner from DB when needed.
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

  if (!assetHolder) {
    const { asset: listing } = await findAssetForBooking({ productData })
    const ownerUUID = resolveIdentifier(listing?.userUUID)
    if (ownerUUID) {
      normalizedAssetHolderId = ownerUUID
      assetHolder = await User.findOne({
        uuid: ownerUUID,
        isDeleted: false,
      })
    }
  }

  if (!assetHolder?.uuid && !normalizedAssetHolderId) {
    throw new Error('assetHolderId is required')
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

  // Hydrate listing snapshot from DB so trustee/admin View has full details
  // even when the client sends a slim productData payload (WAF-safe).
  let listingSnapshot = {
    ...productData,
    userUUID:
      productData?.userUUID ||
      assetHolder?.uuid ||
      normalizedAssetHolderId,
  }
  try {
    const { asset: liveListing } = await findAssetForBooking({
      productData: listingSnapshot,
    })
    if (liveListing) {
      listingSnapshot = buildListingSnapshotFromAsset(
        liveListing,
        listingSnapshot,
      )
    }
  } catch (error) {
    console.log({ bookingListingSnapshotError: error?.message || error })
  }

  // Create booking with productData and timeSlotId
  const booking = await Booking.create({
    slotId: slot._id,
    timeSlotId: timeSlotObjectId,
    timeSlotUUID: timeSlotId,
    assetHolderId: assetHolder?._id,
    assetHolderUUID: assetHolder?.uuid || normalizedAssetHolderId,
    brokerId: broker._id,
    brokerUUID: normalizedBrokerId,
    message,
    productData: listingSnapshot,
    status: 'open',
  })

  const listingTitle = listingSnapshot?.title || productData?.title || 'listing'
  const assetType =
    listingSnapshot?.assetType || productData?.assetType || 'property'
  const buyerName =
    broker?.name || broker?.displayName || broker?.email || 'A buyer'
  const slotDate = slot?.date
    ? moment(slot.date).format('DD MMM YYYY')
    : ''
  const slotTime = matchedTimeSlot?.time || ''

  // Notify Trustee (slot owner) — dashboard + email
  try {
    const trusteeUUID = slotOwner?.uuid || slot.userUUID
    if (trusteeUUID) {
      await createNotification({
        data: {
          userUUID: trusteeUUID,
          UserRole: 'Trustee',
          title: 'Viewing Booked',
          message: `${buyerName} booked a viewing for ${listingTitle}.`,
          RelateRoute: 'Trustee',
          RelatedId: booking?._id,
          RelatedUUID: booking?.uuid,
        },
      })

      await sendTrusteeViewingBookedEmail({
        trusteeUUID,
        buyerName,
        buyerEmail: broker?.email || '',
        assetHolderName: assetHolder?.name || assetHolder?.displayName || '',
        assetHolderEmail: assetHolder?.email || '',
        listingTitle,
        assetType,
        slotDate,
        slotTime,
        message,
      })
    }
  } catch (error) {
    console.log({ trusteeViewingNotifyError: error?.message || error })
  }

  // Notify Asset Holder + FV (dashboard + email) for property / off-plan / car / boat / jewelry.
  try {
    const ownerUUID = assetHolder?.uuid || normalizedAssetHolderId
    await notifyAssetHolderViewingBooked({
      assetHolderUUID: ownerUUID,
      assetHolder,
      buyerName,
      buyerEmail: broker?.email || '',
      listingTitle,
      assetType,
      listingUUID: productData?.uuid,
      bookingId: booking?._id,
      bookingUUID: booking?.uuid,
      slotDate,
      slotTime,
      message,
    })
  } catch (error) {
    console.log({ assetHolderViewingNotifyError: error?.message })
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

// Delete slot (idempotent — deleting an already-deleted slot still succeeds)
export const deleteSlotService = async (slotId) => {
  if (!slotId || typeof slotId !== 'string') {
    throw new Error('Slot id is required')
  }

  const slot = await Slot.findOne({ uuid: slotId.trim() })

  if (!slot) {
    throw new Error('Slot not found')
  }

  if (slot.isDeleted) {
    return { slot, alreadyDeleted: true }
  }

  slot.isDeleted = true
  slot.deletedAt = new Date()
  await slot.save()

  // Send notification (non-blocking — must not fail the delete)
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
    console.log({ error: error?.message || error })
  }

  return { slot, alreadyDeleted: false }
}

// Get all slots
export const getAllSlotsService = async (id, role, explicitCategory) => {
  const slotCategory =
    explicitCategory === VIEWING_SLOT_CATEGORY ||
      explicitCategory === SERVICE_SLOT_CATEGORY
      ? explicitCategory
      : roleToSlotCategory(role)
  const categoryClause = await buildSlotCategoryClause(id, slotCategory)

  if (role === 'Admin') {
    return Slot.find({ ...notDeletedClause }).sort({ createdAt: -1 })
  }

  const query = { userUUID: id, $and: [notDeletedClause] }
  if (categoryClause) query.$and.push(categoryClause)

  return Slot.find(query).sort({ createdAt: -1 })
}

// Get all bookings
export const getAllBookingsService = async (
  userId,
  userRole,
  userUUID,
  options = {},
) => {
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

    const assignedTo = options?.assignedTo
    if (assignedTo) {
      if (!elevated) {
        return []
      }
      if (!['fv_admin', 'myself'].includes(assignedTo)) {
        throw new Error('Invalid assignedTo filter')
      }
      query.viewAssignedTo = assignedTo
    }

    if (!elevated) {
      const isBroker =
        normalizedRole === 'broker' || normalizedRole === 'dealhunter'

      if (isBroker) {
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
        select: 'date times',
      })
      .populate({
        path: 'brokerId',
        select: 'name email phone uuid',
      })
      .populate({
        path: 'assetHolderId',
        select: 'name email phone uuid',
      })
      .select(
        'uuid status message comment viewAssignedTo productData brokerId assetHolderId assetHolderUUID slotId timeSlotUUID createdAt updatedAt',
      )
      .sort({ createdAt: -1 })
      .lean()

    // Resolve sellers missing from populate (older bookings may only have UUID)
    const missingSellerUuids = [
      ...new Set(
        bookings
          .filter((b) => !b?.assetHolderId?.name && b?.assetHolderUUID)
          .map((b) => b.assetHolderUUID),
      ),
    ]
    const sellersByUuid = new Map()
    if (missingSellerUuids.length) {
      const sellers = await User.find({
        uuid: { $in: missingSellerUuids },
        isDeleted: false,
      })
        .select('name email phone uuid')
        .lean()
      for (const s of sellers) sellersByUuid.set(s.uuid, s)
    }

    const populatedBookings = bookings.map((booking) => {
      const timeSlot = booking?.slotId?.times?.find(
        (time) => time.uuid === booking.timeSlotUUID,
      )

      const date = booking?.slotId?.date
      const productData = booking?.productData || {}
      const listingTitle = productData?.title || ''
      const assetType = productData?.assetType || ''
      const seller =
        booking.assetHolderId ||
        (booking.assetHolderUUID
          ? sellersByUuid.get(booking.assetHolderUUID)
          : null) ||
        null
      const buyer = booking.brokerId || null

      return {
        uuid: booking.uuid,
        status: booking.status,
        message: booking.message,
        comment: booking.comment,
        viewAssignedTo: booking.viewAssignedTo || 'myself',
        date,
        timeSlot,
        listingTitle,
        assetType,
        buyerName: buyer?.name || '',
        buyerEmail: buyer?.email || '',
        sellerName: seller?.name || '',
        sellerEmail: seller?.email || '',
        brokerId: buyer,
        assetHolder: seller,
        productData: {
          title: productData?.title,
          assetType: productData?.assetType,
          transferDocuments: productData?.transferDocuments,
          dealClosed: productData?.dealClosed,
        },
        slotId: booking.slotId
          ? { date: booking.slotId.date }
          : null,
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
      select: 'name email phone uuid id',
    })
    .populate({
      path: 'assetHolderId',
      select: 'name email phone uuid id',
    })
    .lean()

  if (!booking) return null

  // Prefer live listing (full beds/size/media) over slim booking snapshots.
  const liveListing = await loadPopulatedListingForBooking(booking)
  const listing = liveListing
    ? buildListingSnapshotFromAsset(liveListing, booking.productData || {})
    : booking.productData || {}

  if (!liveListing && listing && typeof listing === 'object') {
    try {
      await refreshListingMediaSignedUrls(listing)
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
  const transferDocuments = await resolveTransferDocumentsForBooking(booking)
  const { asset } = await findAssetForBooking(booking)

  const amenities = formatAmenitiesList(listing)

  const productCommon = {
    uuid: listing?.uuid || booking.productData?.uuid,
    title: listing?.title || booking.productData?.title,
    assetType: listing?.assetType || booking.productData?.assetType,
    neighbourhood: listing?.neighbourhood || booking.productData?.neighbourhood,
    city: listing?.city || booking.productData?.city,
    country: listing?.country || booking.productData?.country,
    phoneNumber: listing?.phoneNumber || booking.productData?.phoneNumber,
    price: listing?.price ?? listing?.priceFrom ?? booking.productData?.price,
    pictures: listing?.pictures || booking.productData?.pictures,
    thumbnailImg: listing?.thumbnailImg || booking.productData?.thumbnailImg,
    video: listing?.video || booking.productData?.video,
    qrScan: listing?.qrScan || booking.productData?.qrScan,
    amenities,
    facilities: listing?.facilities || booking.productData?.facilities || [],
    technicalFeatures: listing?.technicalFeatures || [],
    extras: listing?.extras || [],
    materials: listing?.materials || [],
    dealClosed:
      booking.productData?.dealClosed ?? Boolean(asset?.dealClosed),
    successFeePaymentStatus:
      booking.productData?.successFeePaymentStatus ||
      asset?.successFeePaymentStatus,
    hasDepositReceipt: booking.productData?.hasDepositReceipt,
    transferDocuments,
    transactionPhase: deriveTransactionPhase({
      ...booking,
      productData: {
        ...(booking.productData || {}),
        transferDocuments,
        dealClosed:
          booking.productData?.dealClosed ?? Boolean(asset?.dealClosed),
      },
    }),
  }

  // Extract asset-specific fields (live listing first) — all asset types
  const assetType = listing?.assetType || booking.productData?.assetType || ''
  const kind = classifyAssetType(assetType)
  let assetFields = []

  const commonLocationFields = [
    { label: 'Neighbourhood', value: listing?.neighbourhood || '' },
    { label: 'City', value: listing?.city || '' },
    { label: 'Country', value: listing?.country || '' },
    { label: 'Map URL', value: listing?.mapUrl || '' },
    {
      label: 'Description',
      value: listing?.propertyDescription || listing?.description || '',
    },
  ]

  if (kind === 'car') {
    assetFields = [
      { label: 'Asset Type', value: assetType },
      { label: 'Title', value: listing?.title || '' },
      { label: 'Price', value: formatPriceForBooking(listing) },
      { label: 'Make', value: listing?.make },
      { label: 'Model', value: listing?.model },
      { label: 'Category', value: listing?.category },
      { label: 'Car Type', value: listing?.carType },
      { label: 'Year', value: listing?.year },
      { label: 'Kilometers', value: listing?.kilometers },
      { label: 'Seats', value: listing?.seats },
      { label: 'Doors', value: listing?.doors },
      { label: 'Body Condition', value: listing?.bodyCondition },
      { label: 'Mechanical Condition', value: listing?.mechanicalCondition },
      { label: 'Warranty', value: listing?.warranty },
      { label: 'Fuel Type', value: listing?.fuelType },
      { label: 'No Of Cylinders', value: listing?.noofCylinders },
      { label: 'Horsepower', value: listing?.horsepower },
      { label: 'Transmission', value: listing?.transmissionType },
      { label: 'Engine Capacity', value: listing?.engineCapacity },
      { label: 'Steering Side', value: listing?.steeringSide },
      {
        label: 'Exterior Color',
        value: formatListValue(listing?.exteriorColor),
      },
      {
        label: 'Interior Color',
        value: formatListValue(listing?.interiorColor),
      },
      { label: 'Seller Type', value: listing?.sellerType },
      ...commonLocationFields,
    ]
  } else if (kind === 'boat') {
    assetFields = [
      { label: 'Asset Type', value: assetType },
      { label: 'Title', value: listing?.title || '' },
      { label: 'Price', value: formatPriceForBooking(listing) },
      { label: 'Brand', value: listing?.brands },
      { label: 'Category', value: listing?.category },
      { label: 'Model', value: listing?.model },
      { label: 'Length', value: listing?.length },
      { label: 'Weight', value: listing?.weight },
      { label: 'Condition', value: listing?.condition },
      { label: 'Age', value: listing?.age },
      { label: 'Usage', value: listing?.usage },
      { label: 'Seats', value: listing?.seats },
      { label: 'Warranty', value: listing?.warranty },
      {
        label: 'Exterior Color',
        value: formatListValue(listing?.exteriorColor),
      },
      {
        label: 'Interior Color',
        value: formatListValue(listing?.interiorColor),
      },
      { label: 'Seller Type', value: listing?.sellerType },
      ...commonLocationFields,
    ]
  } else if (kind === 'jewelry') {
    assetFields = [
      { label: 'Asset Type', value: assetType },
      { label: 'Title', value: listing?.title || '' },
      { label: 'Price', value: formatPriceForBooking(listing) },
      { label: 'Category', value: listing?.category },
      { label: 'Make', value: listing?.make },
      { label: 'Model', value: listing?.model },
      {
        label: 'Metal Material',
        value: formatListValue(listing?.jewelryMetal),
      },
      { label: 'Materials', value: formatListValue(listing?.materials) },
      { label: 'Style', value: listing?.jewelryStyles },
      { label: 'Grams', value: listing?.grams },
      { label: 'Weight', value: listing?.weight },
      { label: 'Length', value: listing?.length },
      { label: 'Condition', value: listing?.condition },
      { label: 'Age', value: listing?.age },
      { label: 'Usage', value: listing?.usage },
      { label: 'Warranty', value: listing?.warranty },
      { label: 'Seller Type', value: listing?.sellerType },
      ...commonLocationFields,
    ]
  } else {
    // Property / lease / off-plan
    assetFields = [
      { label: 'Asset Type', value: assetType },
      { label: 'Title', value: listing?.title || '' },
      { label: 'Price', value: formatPriceForBooking(listing) },
      { label: 'Property Type', value: listing?.propertyType || '' },
      { label: 'Layout', value: listing?.layout || '' },
      { label: 'Size', value: formatSizeForBooking(listing) },
      {
        label: 'Bedrooms',
        value: formatBedBathForBooking(listing?.bedrooms),
      },
      {
        label: 'Bathrooms',
        value: formatBedBathForBooking(listing?.bathrooms),
      },
      { label: 'Developer', value: listing?.developer || '' },
      {
        label: 'Is it Furnished',
        value: formatFurnishedForBooking(listing?.isFurnished),
      },
      {
        label: 'Occupancy Status',
        value: listing?.occupancyStatus || '',
      },
      ...commonLocationFields,
      {
        label: 'Additional Description',
        value: listing?.additionalDescription || '',
      },
      { label: 'ROI', value: listing?.roi != null ? String(listing.roi) : '' },
      {
        label: 'Delivery',
        value: [listing?.deliveryQuarter, listing?.deliveryYear]
          .filter(Boolean)
          .join(' '),
      },
      {
        label: 'Payment Plan',
        value: listing?.paymentPlanType || '',
      },
      {
        label: 'Lease Cheques',
        value:
          listing?.leaseNumberofCheques != null
            ? String(listing.leaseNumberofCheques)
            : '',
      },
    ]
  }

  // Drop empty optional fields so the modal stays readable
  assetFields = assetFields.filter((f) => {
    if (f?.value == null) return false
    if (typeof f.value === 'object') return false
    return String(f.value).trim() !== ''
  })

  const broker = booking.brokerId
    ? {
      ...booking.brokerId,
      phone:
        booking.brokerId.phone ||
        booking.brokerId.phoneNumber ||
        '',
      phoneNumber:
        booking.brokerId.phoneNumber ||
        booking.brokerId.phone ||
        '',
    }
    : booking.brokerId

  // Seller (asset holder) contact — populate may be missing on older bookings
  let seller = booking.assetHolderId || null
  if (!seller?.email) {
    const sellerUUID =
      booking.assetHolderUUID ||
      listing?.userUUID ||
      booking.productData?.userUUID ||
      null
    if (sellerUUID) {
      seller = await User.findOne({
        uuid: sellerUUID,
        isDeleted: false,
      })
        .select('name email phone uuid id')
        .lean()
    }
  }
  const assetHolder = seller
    ? {
      ...seller,
      phone: seller.phone || seller.phoneNumber || '',
      phoneNumber: seller.phoneNumber || seller.phone || '',
      name: seller.name || '',
      email: seller.email || '',
    }
    : null

  return {
    uuid: booking.uuid,
    message: booking.message,
    comment: booking.comment,
    buyerAttended: booking.buyerAttended,
    sellerAttended: booking.sellerAttended,
    viewAssignedTo: booking.viewAssignedTo || 'myself',
    date: booking.slotId?.date,
    time: timeSlot?.time,
    brokerId: broker,
    assetHolder,
    productData: {
      ...productCommon,
      fields: assetFields,
    },
  }
}

// Get booking by ID
export const getBookingByIdAssetValue = async (assetUuid) => {
  try {
    const booking = await Booking.findOne({
      'productData.uuid': assetUuid,
      isDeleted: false,
    })
      .populate('slotId')
      .populate('brokerId')
      .populate('assetHolderId')

    if (!booking) {
      return null
    }

    const timeSlot = booking?.slotId?.times?.find(
      (time) => time.uuid === booking.timeSlotUUID,
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
    $and: [notDeletedClause, categoryClause],
  }).select('-_id -createdAt -isDeleted -deletedAt')
}

/** Next calendar day (UTC YYYY-MM-DD) that still has open viewing times. */
export const getNextAvailableViewingDateService = async (
  userUUID,
  fromDate = new Date(),
) => {
  if (!userUUID) return null

  const start = moment.utc(String(fromDate).slice(0, 10) || undefined)
  if (!start.isValid()) return null
  start.startOf('day')

  const categoryClause = await buildSlotCategoryClause(
    userUUID,
    VIEWING_SLOT_CATEGORY,
  )
  if (!categoryClause) return null

  const slot = await Slot.findOne({
    userUUID,
    date: { $gte: start.toDate() },
    'times.isBooked': false,
    $and: [notDeletedClause, categoryClause],
  })
    .sort({ date: 1 })
    .select('date uuid times')
    .lean()

  if (!slot?.date) return null
  return {
    date: moment.utc(slot.date).format('YYYY-MM-DD'),
    slotUuid: slot.uuid || null,
  }
}

/**
 * Upcoming YYYY-MM-DD dates that still have at least one open (unbooked) viewing time.
 * Used by Arrange Viewing calendar so empty days stay disabled.
 */
export const getAvailableViewingDatesService = async (
  userUUID,
  fromDate = new Date(),
) => {
  if (!userUUID) return []

  const start = moment.utc(String(fromDate).slice(0, 10) || undefined)
  if (!start.isValid()) return []
  start.startOf('day')

  const categoryClause = await buildSlotCategoryClause(
    userUUID,
    VIEWING_SLOT_CATEGORY,
  )
  if (!categoryClause) return []

  const slots = await Slot.find({
    userUUID,
    date: { $gte: start.toDate() },
    'times.isBooked': false,
    $and: [notDeletedClause, categoryClause],
  })
    .select('date times')
    .sort({ date: 1 })
    .lean()

  const dates = []
  const seen = new Set()
  for (const slot of slots) {
    const hasOpen = (slot.times || []).some((t) => t && t.isBooked !== true)
    if (!hasOpen || !slot.date) continue
    const key = moment.utc(slot.date).format('YYYY-MM-DD')
    if (seen.has(key)) continue
    seen.add(key)
    dates.push(key)
  }
  return dates
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
    $and: [notDeletedClause, categoryClause],
  })
    .select('-_id -createdAt -isDeleted -deletedAt')
    .lean()
}

export const toggleBookingUnderProcessService = async (bookingId, underProcess) => {
  const booking = await Booking.findOne({ uuid: bookingId, isDeleted: false })
  if (!booking) throw new Error('Booking not found')

  booking.status = underProcess ? 'under_process' : 'open'
  await booking.save()

  const assetUuid = booking.productData?.uuid
  const assetType = booking.productData?.assetType
  await syncListingUnderProcessFlag(assetType, assetUuid)

  return booking
}

export const getTransactionBookingsService = async () => {
  const bookings = await Booking.find({ isDeleted: false })
    .populate({ path: 'slotId', select: 'date times' })
    .populate({ path: 'brokerId', select: 'name email' })
    .populate({ path: 'assetHolderId', select: 'name email' })
    .sort({ updatedAt: -1 })
    .lean()

  const rows = []

  for (const booking of bookings) {
    if (!isTransactionBooking(booking)) continue

    const timeSlot = booking?.slotId?.times?.find(
      (time) => time.uuid === booking.timeSlotUUID,
    )
    const productData = booking.productData || {}
    const transferDocuments = productData.transferDocuments || {}
    const phase = deriveTransactionPhase(booking)

    let hasDepositReceipt = false
    try {
      const { asset } = await findAssetForBooking(booking)
      hasDepositReceipt = Boolean(asset?.transactionDepositDocument)
    } catch {
      hasDepositReceipt = false
    }

    rows.push({
      bookingUuid: booking.uuid,
      assetUuid: productData.uuid,
      assetType: productData.assetType,
      title: productData.title,
      neighbourhood: productData.neighbourhood,
      sellerName: booking.assetHolderId?.name || '—',
      buyerName: booking.brokerId?.name || '—',
      viewingDate: booking.slotId?.date,
      viewingTime: timeSlot?.time,
      phase,
      successFee: transferDocuments.successFee ?? null,
      hasTransferDoc: Boolean(transferDocuments.assetTransferDocument),
      hasPaymentProof: Boolean(transferDocuments.PaymentProof),
      transferDocumentUrl: transferDocuments.assetTransferDocument || null,
      paymentProofUrl: transferDocuments.PaymentProof || null,
      hasDepositReceipt,
      dealClosed: Boolean(productData.dealClosed),
      bookingStatus: booking.status,
      viewAssignedTo: booking.viewAssignedTo || 'myself',
    })
  }

  return rows
}

export const updateTrusteeDepositService = async (
  bookingId,
  { transactionDepositDocument, trusteeNote },
) => {
  const booking = await Booking.findOne({ uuid: bookingId, isDeleted: false })
  if (!booking) throw new Error('Booking not found')

  const { asset } = await findAssetForBooking(booking)
  if (!asset) throw new Error('Asset not found')

  if (transactionDepositDocument) {
    asset.transactionDepositDocument = transactionDepositDocument
  }
  if (trusteeNote !== undefined) {
    asset.trusteeNote = trusteeNote
  }
  await asset.save()

  if (transactionDepositDocument) {
    booking.productData = booking.productData || {}
    booking.productData.hasDepositReceipt = true
    await booking.save()
  }

  return { booking, asset }
}
