import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

// Documentation schema used across multiple roles
const DocumentationSchema = new Schema({
  type: { type: String, required: true },

  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealHunterDoc',
    required: true,
  },
})

// Enum values for property types, regions, and various statuses
const propertyTypesEnum = [
  'Apartments',
  'Workers Housing',
  'Villa',
  'Student Housing',
  'Building',
  'Industrial',
  'Office',
  'Land',
  'Retail',
]
const regionsEnum = [
  'US',
  'Europe',
  'Canada',
  'Africa',
  'United Arab Emirates',
  'Asia',
  'America',
  'Oceania',
]
const statusEnum = ['Pending', 'Processing', 'Completed', 'Cancelled']

// User schema
const userSchema = new Schema(
  {
    // Common user fields
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    phone: String,
    country: String,
    city: { type: String },
    address: String,
    profileImage: String,
    gender: String,
    lastname: String,
    dateOfBirth: Date,
    maritalStatus: String,
    documentation: [DocumentationSchema],
    userState: { type: String, default: 'inactive' },
    uuid: {
      type: String,
      default: () => uuidv4(), // always generated
      unique: true,
      required: true,
    },
    role: {
      type: String,
      enum: [
        'Admin',
        'Evaluator',
        'Sub-Evaluator',
        'AssetHolder',
        'Trustee',
        'DealHunter',
        'TechnicalReport',
        '3dWalkthrough',
        'Advertiser',
        'Developer',
      ],
      required: true,
    },
    about: String,
    userType: String,
    parentEvaluator: { type: String },
    // Fields for Asset Holders
    assetId: { type: String },
    propertyTypes: { type: [String], enum: propertyTypesEnum },
    region: { type: [String], enum: regionsEnum },
    electronicConsent: {
      consentTerms: { type: Boolean, default: false },
      consentTaxTerms: { type: Boolean, default: false },
    },

    // Fields for Evaluators
    financialInfo: {
      verificationCertificate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealHunterDoc',
      },
      fundsVerification: String,
      bankName: String,
      bankBranch: String,
      city: String,
      country: String,
      status: {
        type: String,
        default: 'Pending',
        enum: ['Pending', 'Approved'],
      },
    },
    // Corporate KYC for Developer / Corporate accounts
    developerKyc: {
      companyName: { type: String },
      username: { type: String },
      jurisdiction: { type: String },
      tradeLicenseNumber: { type: String },
      status: {
        type: String,
        enum: ['NotStarted', 'Submitted', 'Pending', 'Approved', 'Rejected'],
        default: 'NotStarted',
      },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewNote: { type: String },
    },
    personalDetails: {
      residenceStatus: String,
      citizenship: String,
      industry: String,
      employerName: String,
    },
    emiratesId: {
      fullName: String,
      number: String,
      expiryDate: Date,
    },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    pendingEmailChange: {
      newEmail: String,
      token: String,
      expires: Date,
    },
    // Purchase tracker for specific roles
    purchaseTracker: {
      transactionStatus: { type: String, enum: statusEnum },
      assetDetails: { type: String, enum: statusEnum },
      timelineOfActivities: { type: String, enum: statusEnum },
      escrowAccountInformation: { type: String, enum: statusEnum },
      progressTracking: { type: String, enum: statusEnum },
    },
    // Refresh token and password reset
    refreshToken: String,
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetTokenExpiresAt: Date,
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
)

const User = mongoose.model('User', userSchema)

export default User
