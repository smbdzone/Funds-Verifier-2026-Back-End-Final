import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const DocumentationSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  type: {
    type: String,
    required: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealHunterDoc',
    required: true, // Ensure document is provided
  },
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
  assetId: {
    type: String,
    required: true,
    unique: true,
  },
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

const UserProfile = mongoose.model('AssetHolderProfile', userProfileSchema)

export default UserProfile
