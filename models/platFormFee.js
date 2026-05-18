import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const PlatformFeeSchema = new mongoose.Schema({
  propertyFee: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 15,
  },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  carFee: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 15,
  },
  boatFee: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 15,
  },
  jewelryFee: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 15,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

export default mongoose.models.PlatformFee ||
  mongoose.model('PlatformFee', PlatformFeeSchema)
