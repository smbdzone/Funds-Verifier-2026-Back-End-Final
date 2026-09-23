import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const LocationCountrySchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameNormalized: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, default: '', trim: true, uppercase: true, maxlength: 2 },
    isBuiltin: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

LocationCountrySchema.index(
  { nameNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
)

export default mongoose.models.LocationCountry ||
  mongoose.model('LocationCountry', LocationCountrySchema)
