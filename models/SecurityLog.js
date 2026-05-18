import mongoose from 'mongoose'

const SecurityLogSchema = new mongoose.Schema(
  {
    ip: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    endpoint: String,
    attempts: { type: Number, default: 0 },
    reason: String,
    blockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
)

export default mongoose.model('SecurityLog', SecurityLogSchema)
