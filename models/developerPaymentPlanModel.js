import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const milestoneSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
    dueLabel: { type: String, default: '', trim: true },
  },
  { _id: false },
)

const developerPaymentPlanSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperProject',
      required: true,
      index: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    downPaymentPercent: { type: Number, default: 0, min: 0, max: 100 },
    constructionPercent: { type: Number, default: 0, min: 0, max: 100 },
    postHandoverPercent: { type: Number, default: 0, min: 0, max: 100 },
    milestones: { type: [milestoneSchema], default: [] },
    escrowBankName: { type: String, default: '', trim: true },
    escrowAccountName: { type: String, default: '', trim: true },
    escrowAccountNumber: { type: String, default: '', trim: true },
    escrowIban: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    isDefault: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

developerPaymentPlanSchema.index({ project: 1, isDeleted: 1, createdAt: -1 })

const DeveloperPaymentPlan = mongoose.model(
  'DeveloperPaymentPlan',
  developerPaymentPlanSchema,
)

export default DeveloperPaymentPlan
