import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

const timeSlotSchema = new Schema({
  time: {
    type: String,
    required: true,
  },
  isBooked: {
    type: Boolean,
    default: false,
  },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
})

const slotSchema = new Schema({
  // userId: { type: String, required: true },
  userUUID: { type: String, required: true },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
  },
  userId: { type: String },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  times: [timeSlotSchema],
  /** viewing = trustee arrange-viewing; service = evaluator / 3D / technical report */
  slotCategory: {
    type: String,
    enum: ['viewing', 'service'],
    default: 'service',
    index: true,
  },
  creatorRole: { type: String },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const Slot = mongoose.model('Slot', slotSchema)
export default Slot
