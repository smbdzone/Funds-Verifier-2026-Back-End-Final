import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const bookingSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  assetType: {
    type: String,
    required: true,
    enum: [
      'Property For Sale',
      'Car For Sale',
      'Jewellery For Sale',
      'Boats for sale',
    ],
  },
  assetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'assetType',
  },
  bookingDate: {
    type: Date,
    required: true,
  },
  bookingTime: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const Booking = mongoose.model('Booking', bookingSchema)

export default Booking
