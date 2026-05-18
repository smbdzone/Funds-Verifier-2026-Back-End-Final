import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

const brokerSchema = new Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const Broker = mongoose.model('Broker', brokerSchema)
export default Broker
