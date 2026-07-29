import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

export const MEDIA_DOC_TYPES = [
  'Floor Plan',
  '3D Render',
  'Photo',
  'Title Deed',
  'Master Community Approval',
  'NOC',
  'Brochure',
  'Other',
]

const developerMediaSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperProject',
      required: true,
      index: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperUnit',
      default: null,
      index: true,
    },
    docType: {
      type: String,
      enum: MEDIA_DOC_TYPES,
      required: true,
    },
    title: { type: String, default: '', trim: true, maxlength: 200 },
    fileKind: {
      type: String,
      enum: ['image', 'document'],
      default: 'document',
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
      default: null,
    },
    imageAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

developerMediaSchema.index({ project: 1, isDeleted: 1, createdAt: -1 })

const DeveloperMedia = mongoose.model('DeveloperMedia', developerMediaSchema)

export default DeveloperMedia
