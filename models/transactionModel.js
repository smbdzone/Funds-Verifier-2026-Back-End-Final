import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    payment_details: { type: Object },
    payment_method_status: { type: String, default: 'unpaid' },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const Transaction = mongoose.model('Transaction', transactionSchema)

export default Transaction
