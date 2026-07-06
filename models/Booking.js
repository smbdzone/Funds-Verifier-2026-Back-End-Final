import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

const bookingSchema = new Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  slotId: {
    type: Schema.Types.ObjectId,
    ref: 'Slot',
    required: true,
  },
  timeSlotId: {
    type: Schema.Types.ObjectId,
    ref: 'Slot',
    required: true, // Store the specific time slot ID
  },
  assetHolderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  brokerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: String,
  productData: {
    type: Schema.Types.Mixed, // Allows storing any kind of data
    required: true, // Ensure it's provided
  },
  timeSlotUUID: { type: String },
  assetHolderUUID: { type: String },
  brokerUUID: { type: String },
  sellerAttended: { type: String },
  buyerAttended: { type: String },
  comment: { type: String },
  viewAssignedTo: {
    type: String,
    enum: ['myself', 'fv_admin'],
    default: 'myself',
  },
  status: {
    type: String,
    enum: ['open', 'under_process', 'completed'],
    default: 'open',
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const Booking = mongoose.model('arrangeViewing', bookingSchema)
export default Booking
