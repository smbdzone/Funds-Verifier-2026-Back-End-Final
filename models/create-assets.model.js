import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const createAssetsSchema = new mongoose.Schema({
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  assetType: { type: String, required: true },
  country: { type: String, required: true },
  city: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  neighbourhood: { type: String, required: true },
  title: { type: String, required: true, maxlength: 50, unique: true },
  slug: { type: String, required: true },
  pictures: { type: [Object], default: [] },
  video: { type: Object, default: {} },
  thumbnailImg: { type: Object, default: {} },
  evaluationCertificate: { type: Object, default: null },
  video3DWalkthrough: { type: String, default: '' },
  technicalReport: { type: String, default: '' },
  evaluationDateTime: { type: Date, required: false },
  price: { type: Number, required: true },
  description: { type: String, required: true },
  additionalDescription: { type: String, maxlength: 1000 },
  propertyType: { type: String, required: true },
  leaseNumberofCheques: { type: Number, required: true },
  sizeSQFT: { type: Number, required: true },
  bedrooms: { type: Number, required: true },
  bathrooms: { type: Number, required: true },
  occupancyStatus: { type: String, required: true },
  isFurnished: { type: String, required: true },
  developer: { type: String, required: true },
  listings: { type: [String], enum: ['Private', 'Public'], default: 'Public' },
  facilities: { type: [String], default: [] },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const CreateAssets = mongoose.model('uploaded-assets', createAssetsSchema)
export default CreateAssets
