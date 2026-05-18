import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

const DocumentationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealHunterDoc',
    required: true, // Ensure document is provided
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

const userProfileSchema = new Schema({
  fullName: {
    type: String,
    required: true,
  },
  about: String,
  role: String,
  country: String,
  address: String,
  phone: String,
  profileImage: String,
  email: {
    type: String,
    required: true,
    unique: true,
  },
  documentation: [DocumentationSchema],
  userState: { type: String, default: 'inactive' },
  gender: String,
  dateOfBirth: Date,
  electronicConsent: {
    consentTerms: {
      type: Boolean,
      default: false,
    },
    consentTaxTems: {
      type: Boolean,
      default: false,
    },
  },
})

const EvaluatorProfile = mongoose.model('EvaluatorProfile', userProfileSchema)

export default EvaluatorProfile
