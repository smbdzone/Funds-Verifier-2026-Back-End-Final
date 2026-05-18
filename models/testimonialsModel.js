import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const TestimonialSchema = new Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: false },
  designation: { type: String, required: false },
  rating: { type: Number, required: true },
  profile: { type: String, required: false },
  profileId: { type: String, required: false },
  description: { type: String, required: true },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

const Testimonials = mongoose.model('Testimonials', TestimonialSchema)

export default Testimonials
