import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const Request3DSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    dateTime: { type: Date, required: true },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    link: { type: String },
    productTitle: { type: String, default: '' },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    assetType: {
      type: String,
      enum: [
        'Property For Sale',
        'Car For Sale',
        'Jewellery For Sale',
        'Boats For Sale',
      ],
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    productUUID: {
      type: String,
      default: null,
    },
    payment_details: { type: Object },
    payment_method_status: { type: String, default: 'unpaid' },
    status: {
      type: String,
      enum: ['pending', 'successful'],
      default: 'pending',
    },
    userUUID: { type: String },
    value: { type: String },
    category: { type: String },
    subCategory: { type: String },
    price: { type: Number },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const Request3D = mongoose.model('Request3D', Request3DSchema)

export default Request3D
