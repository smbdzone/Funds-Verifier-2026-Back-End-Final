import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const LocationNeighbourhoodSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameNormalized: { type: String, required: true, trim: true, lowercase: true },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LocationCity',
      required: true,
      index: true,
    },
    cityName: { type: String, required: true, trim: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

LocationNeighbourhoodSchema.index(
  { city: 1, nameNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
)

export default mongoose.models.LocationNeighbourhood ||
  mongoose.model('LocationNeighbourhood', LocationNeighbourhoodSchema)
