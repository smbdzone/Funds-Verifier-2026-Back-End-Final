import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const AdsWalletModel = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  total: { type: Number, required: true, default: 0 },
})

const AdsWallet = mongoose.model('AdsWallet', AdsWalletModel)

export default AdsWallet
