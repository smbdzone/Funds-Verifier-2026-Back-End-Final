import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

export const INQUIRY_TYPES = ['pof', 'offer', 'reserve']
export const INQUIRY_STATUSES = [
  'Pending',
  'Accepted',
  'Declined',
  'Withdrawn',
]

const developerInquirySchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: INQUIRY_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: INQUIRY_STATUSES,
      default: 'Pending',
      index: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
      index: true,
    },
    propertyUuid: { type: String, default: '', trim: true, index: true },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    developerUnit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperUnit',
      default: null,
    },
    offerAmount: { type: Number, default: null },
    currency: { type: String, default: 'AED', trim: true },
    message: { type: String, default: '', trim: true, maxlength: 2000 },
    /** Snapshot of buyer POF at submit time */
    pofAmount: { type: Number, default: null },
    pofStatus: { type: String, default: '', trim: true },
    listingTitle: { type: String, default: '', trim: true },
    listingSlug: { type: String, default: '', trim: true },
    developerNote: { type: String, default: '', trim: true, maxlength: 1000 },
    respondedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

const DeveloperInquiry = mongoose.model(
  'DeveloperInquiry',
  developerInquirySchema,
)

export default DeveloperInquiry
