import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    review: { type: String, required: true },
    ratingNumber: { type: Number, required: true },
    productTitle: { type: String, required: true },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      // required: true,
    },
    productUUID: {
      type: String,
      default: null,
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const Review = mongoose.model('Review', reviewSchema)

export default Review
