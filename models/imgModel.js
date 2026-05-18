import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { attachAssetDocRefreshHook } from '../helper/refreshAssetSignedUrls.js'

const { Schema } = mongoose

// Define asset schema
const AssetSchema = new Schema(
  {
    // Fields for images and videos
    images: [],
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

AssetSchema.post('find', attachAssetDocRefreshHook)
AssetSchema.post('findOne', attachAssetDocRefreshHook)
AssetSchema.post('findOneAndUpdate', attachAssetDocRefreshHook)

const ImageAsset = mongoose.model('ImageAsset', AssetSchema)
export default ImageAsset
