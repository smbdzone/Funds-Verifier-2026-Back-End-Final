import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

export const UNIT_CATEGORIES = [
  'Off-Plan',
  'Completed',
  'Villa',
  'Apartment',
  'Penthouse',
]

export const UNIT_STATUSES = [
  'Draft',
  'Available',
  'Reserved',
  'Under Offer',
  'Sold',
]

const developerUnitSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperProject',
      required: true,
      index: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    unitNumber: { type: String, required: true, trim: true },
    floor: { type: String, default: '', trim: true },
    category: {
      type: String,
      enum: UNIT_CATEGORIES,
      default: 'Apartment',
    },
    builtUpArea: { type: Number, default: null },
    orientation: { type: String, default: '', trim: true },
    view: { type: String, default: '', trim: true },
    listingPrice: { type: Number, default: null },
    currency: { type: String, default: 'AED', trim: true },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    paymentPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperPaymentPlan',
      default: null,
    },
    status: {
      type: String,
      enum: UNIT_STATUSES,
      default: 'Draft',
    },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

developerUnitSchema.index(
  { project: 1, unitNumber: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
)

const DeveloperUnit = mongoose.model('DeveloperUnit', developerUnitSchema)

export default DeveloperUnit
