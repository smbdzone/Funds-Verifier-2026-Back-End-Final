import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const ReportSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    dateTime: { type: Date, required: true },
    phone: { type: String, required: true },
    productTitle: { type: String, default: '' },
    IsRecommended: { type: Boolean, default: false },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    reportFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    }, // Optional
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
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    productUUID: {
      type: String,
      default: null,
    },
    productTitle: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'successful'],
      default: 'pending',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    userUUID: { type: String },
    payment_details: { type: Object },
    payment_method_status: { type: String, default: 'unpaid' },
    status: {
      type: String,
      enum: ['pending', 'successful'],
      default: 'pending',
    },
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

const ReportTechnical = mongoose.model('ReportTechnical', ReportSchema)

export default ReportTechnical
