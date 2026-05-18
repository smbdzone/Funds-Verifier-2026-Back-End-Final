import mongoose from 'mongoose' // Erase if already required
import { v4 as uuidv4 } from 'uuid'

// Declare the Schema of the Mongo model
var contactSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  mobile: {
    type: String,
    required: true,
  },
  comment: {
    type: String,
    required: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  status: {
    type: String,
    default: 'Submitted',
    enum: ['Submitted', 'Contacted', 'InProgress'],
  },
})

//Export the model
const Contact = mongoose.model('Contact', contactSchema)

export default Contact
