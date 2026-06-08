import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    payment_details: { type: Object },
    payment_method_status: { type: String, default: 'unpaid' },
    payment_provider: {
      type: String,
      enum: ['stripe', 'clozer'],
      default: 'stripe',
    },
    fvTransactionId: { type: String, unique: true, sparse: true },
    clozer_status: {
      type: String,
      enum: [
        'pending',
        'approved',
        'active',
        'completed',
        'rejected',
        'defaulted',
      ],
      default: 'pending',
    },
    service_type: { type: String },
    service_metadata: { type: Object },
    total_amount: { type: Number },
    monthly_installment_amount: { type: Number },
    number_of_installments: { type: Number },
    installments_paid: { type: Number, default: 0 },
    total_paid: { type: Number, default: 0 },
    installment_updates: [{ type: Object }],
    redirect_token_expires: { type: Date },
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
