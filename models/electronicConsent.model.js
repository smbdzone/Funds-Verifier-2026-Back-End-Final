import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const ElectronicConsentSchema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  consentTerms: { type: Boolean, required: true },
  consentTaxNotification: { type: Boolean, required: true },
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

const ElectronicConsent = mongoose.model(
  'ElectronicConsent',
  ElectronicConsentSchema
)

export default ElectronicConsent
