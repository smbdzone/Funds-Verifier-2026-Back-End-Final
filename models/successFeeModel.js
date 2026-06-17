import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const SuccessFeeSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  propertySuccessFee: {
    type: Number,
    required: true,
    min: 0,
    default: 6000,
  },
  boatSuccessFee: {
    type: Number,
    required: true,
    min: 0,
    default: 3000,
  },
  carSuccessFee: {
    type: Number,
    required: true,
    min: 0,
    default: 2000,
  },
  jewelrySuccessFee: {
    type: Number,
    required: true,
    min: 0,
    default: 2000,
  },
  fullPayDiscountPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 50,
    default: 5,
  },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

export default mongoose.models.SuccessFee ||
  mongoose.model('SuccessFee', SuccessFeeSchema)
