import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const contactSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    fullName: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    phone: { type: String, required: true },
    message: { type: String, required: true },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.models.ContactUs ||
  mongoose.model('ContactUs', contactSchema)
