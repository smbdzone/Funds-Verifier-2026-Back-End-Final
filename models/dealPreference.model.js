import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const DealPreferenceSchema = new Schema({
  userId: { type: String },
  propertyTypes: { type: [String], required: true },
  regions: { type: [String], required: true },
  escrowAccount: { type: [String], required: true },
  escrowAccountFunds: { type: [String], required: true },
  carTypes: { type: [String], required: true },
  boatTypes: { type: [String], required: true },
  jewelryTypes: { type: [String], required: true },
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

const DealPreference = mongoose.model('DealPreference', DealPreferenceSchema)

export default DealPreference
