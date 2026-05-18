import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const Schema = mongoose.Schema

const UserPaymentDetailsSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      require: true,
    },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    userUUID: { type: String, required: true }, // Public identifier
    assetId: { type: String, required: true },
    assetType: { type: String, required: true },
    customerId: { type: String, required: true },
    assetTitle: { type: String },
    paymentMethod: { type: String, required: true },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const UserPaymentDetails = mongoose.model(
  'UserPaymentDetails',
  UserPaymentDetailsSchema
)
export default UserPaymentDetails
