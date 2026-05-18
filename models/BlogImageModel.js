import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

// Define asset schema
const BlogSchema = new Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    Certificate: {
      url: { type: String, required: true }, // Cloudinary URL
      name: { type: String, required: false }, // Original file name
      asset_id: { type: String, required: false }, // Optional: Cloudinary asset ID
      public_id: { type: String, required: false }, // Optional: Cloudinary public ID
    },
  },
  { timestamps: true }
)

// Create and export model
const BlogImage = mongoose.model('BlogImage', BlogSchema)
export default BlogImage
