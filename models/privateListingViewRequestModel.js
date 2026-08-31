import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const privateListingViewRequestSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    listingUuid: { type: String, required: true, trim: true, index: true },
    listingSlug: { type: String, default: '', trim: true },
    listingTitle: { type: String, default: '', trim: true },
    assetType: { type: String, default: '', trim: true },
    listingModel: {
      type: String,
      enum: ['Property', 'Car', 'Boat', 'Jewelry'],
      required: true,
    },
    listingRef: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sellerUUID: { type: String, default: '', trim: true, index: true },
    sellerEmail: { type: String, default: '', trim: true },
    sellerName: { type: String, default: '', trim: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

privateListingViewRequestSchema.index({ email: 1, listingUuid: 1, createdAt: -1 })

export default mongoose.models.PrivateListingViewRequest ||
  mongoose.model('PrivateListingViewRequest', privateListingViewRequestSchema)
