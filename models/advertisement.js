import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'
const schema = new Schema({
  creatives: [
    {
      img: { type: Object, required: true },
      adLink: { type: String, required: true },
      format: { type: String, default: 'footer-banner' },
      impressions: [
        {
          country: String,
          cities: String,
          userId: String,
          time: String,
          date: String,
        },
      ],
      clicks: [
        {
          country: String,
          cities: String,
          userId: String,
          time: String,
          date: String,
        },
      ],
    },
  ],
  totalBudgetUsed: { type: Number, default: 0 },
  budget: { type: String, required: true },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  // sessionId: { type: String, unique: true },
  targetedAudience: {
    country: [mongoose.Schema.Types.Mixed],
    city: [mongoose.Schema.Types.Mixed],
    gender: { type: String, default: '' },
    ageGroup: { type: String, default: '' },
    startAt: [{ type: String, required: true }],
    endAt: [{ type: String, required: true }],
  },
  userId: { type: String, required: true },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'canceled'],
    default: 'in_progress',
  },
  paymentStatus: { type: Number, default: 0 },
  Approval: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  email: { type: String },
  RejectedReason: { type: String },
  createdAt: { type: Date, default: Date.now },
})

schema.index({ userId: 1 })
schema.index({ status: 1 })
schema.index({ createdAt: -1 })
schema.index({ 'creatives.impressions.country': 1 })
schema.index({ 'creatives.clicks.country': 1 })

const model = mongoose.model('advertisement', schema)

export default model
