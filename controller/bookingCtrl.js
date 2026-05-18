import Booking from '../models/bookingsModel.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import { createNotification } from './notifications.controller.js'

export const createBooking = async (req, res) => {
  const userId = req.query.userId
  try {
    // Log the entire request body to debug
    const { assetType, title, bookingDate, bookingTime } = req.body

    // Validate assetType
    if (!assetType) {
      return res.status(400).json({ message: 'Asset type is required' })
    }

    if (
      ![
        'Property For Sale',
        'Car For Sale',
        'Jewellery For Sale',
        'Boats for sale',
      ].includes(assetType)
    ) {
      return res
        .status(400)
        .json({ message: `Invalid asset type: ${assetType}` })
    }

    // Check if the asset exists
    let asset
    switch (assetType) {
      case 'Property For Sale':
        asset = await Property.findOne({ title, isDeleted: false })
        break
      case 'Car For Sale':
        asset = await Car.findOne({ title, isDeleted: false })
        break
      case 'Jewellery For Sale':
        asset = await Jewelry.findOne({ title, isDeleted: false })
        break
      case 'Boats for sale':
        asset = await Boat.findOne({ title, isDeleted: false })
        break
      default:
        return res.status(400).json({ message: 'Invalid asset type' })
    }

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' })
    }

    // Create a new booking
    const newBooking = new Booking({
      assetType,
      assetId: asset._id,
      bookingDate,
      bookingTime,
    })

    await newBooking.save()

    if (userId) {
      try {
        const NotificationData = {
          // userId: userId,
          userUUID: userId,
          UserRole: 'AssetHolder',
          title: 'Request Booking',
          message: `A new booking added for asset.`,
          RelateRoute: 'booking',
          RelatedId: newBooking?._id,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }
    }

    res.status(201).json(newBooking)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error })
  }
}

export const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ isDeleted: false })
    res.status(200).json(bookings)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error })
  }
}

export const updateBooking = async (req, res) => {
  try {
    const userId = req.query.userId
    const { id } = req.params
    const updates = req.body

    const updatedBooking = await Booking.findByIdAndUpdate(id, updates, {
      isDeleted: false,
      new: true,
    })

    if (!updatedBooking) {
      return res.status(404).json({ message: 'Booking not found' })
    }

    if (userId) {
      try {
        const NotificationData = {
          // userId: userId,
          userUUID: userId,
          UserRole: 'AssetHolder',
          title: 'Request Booking',
          message: `Booking is updated for an asset.`,
          RelateRoute: 'booking',
          RelatedId: updatedBooking?._id,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }
    }

    res.status(200).json(updatedBooking)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error })
  }
}
