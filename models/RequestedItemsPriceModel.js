import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const RequestedItemsPriceSchema = new mongoose.Schema(
  {
    requestedFor: {
      type: String,
      enum: ['3dwalkthrough', 'technicalreport'],
      required: true,
    },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    AssetType: { type: String, required: true },
    userId: { type: String, required: true },
    Category: { type: String, required: true },
    PropertyType: { type: String, required: false },
    price: { type: Number, required: true },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const RequestedItemsPrice = mongoose.model(
  'RequestedItemsPrice',
  RequestedItemsPriceSchema
)

export default RequestedItemsPrice
