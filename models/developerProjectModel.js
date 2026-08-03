import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const developerProjectSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    thumbnailImg: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ThumbnailImg',
      default: null,
    },
    pictures: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    mapUrl: { type: String, default: '', trim: true },
    developerLicenseNumber: { type: String, default: '', trim: true },
    reraNumber: { type: String, default: '', trim: true },
    escrowBankName: { type: String, default: '', trim: true },
    escrowAccountName: { type: String, default: '', trim: true },
    escrowAccountNumber: { type: String, default: '', trim: true },
    escrowIban: { type: String, default: '', trim: true },
    expectedHandoverDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Archived'],
      default: 'Draft',
    },
    // Listing review lifecycle (Steps 8–9) — separate from operational status
    reviewStatus: {
      type: String,
      enum: [
        'Draft',
        'Submitted',
        'UnderReview',
        'ChangesRequested',
        'Approved',
        'Published',
        'Suspended',
      ],
      default: 'Draft',
      index: true,
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewNote: { type: String, default: '', trim: true, maxlength: 2000 },
    assignedEvaluator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewHistory: [
      {
        status: { type: String, required: true },
        note: { type: String, default: '' },
        actor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        at: { type: Date, default: Date.now },
      },
    ],
    publishedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

developerProjectSchema.index({ developer: 1, isDeleted: 1, createdAt: -1 })
developerProjectSchema.index({ reviewStatus: 1, isDeleted: 1, submittedAt: -1 })

const DeveloperProject = mongoose.model(
  'DeveloperProject',
  developerProjectSchema,
)

export default DeveloperProject
