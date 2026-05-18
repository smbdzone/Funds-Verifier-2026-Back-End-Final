import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

// Define asset schema
const CertificateSchema = new Schema(
  {
    Certificate: {
      // During migration, `url` can be Cloudinary or CloudFront. Not required anymore.
      url: { type: String, required: false },
      // S3 metadata (new)
      s3Bucket: { type: String, required: false },
      s3Key: { type: String, required: false, index: true },
      s3VersionId: { type: String, required: false },
      s3ETag: { type: String, required: false },
      name: { type: String, required: false }, // Original file name
      asset_id: { type: String, required: false }, // Optional: Cloudinary asset ID
      public_id: { type: String, required: false }, // Optional: Cloudinary public ID
      iv: { type: String },
      tag: { type: String },
      encrypted: { type: Boolean, default: false },
    },
    userUUID: { type: String, required: false, index: true },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Create and export model
const   EvaluationCertificate = mongoose.model(
  'EvaluationCertificate',
  CertificateSchema
)
export default EvaluationCertificate
