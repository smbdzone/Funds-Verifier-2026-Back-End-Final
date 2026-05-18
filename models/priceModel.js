import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

// Define price schema
const priceSchema = new Schema(
  {
    price: { type: String, required: true },
    assetType: { type: String, required: true },
    value: { type: String },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    category: { type: String, required: true },
    subCategory: { type: String },
    userUUID: { type: String },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Create and export model
const Price = mongoose.model('Price', priceSchema)
export default Price
