import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const DocumentStatusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'received', 'verified'],
      default: 'pending',
    },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },

    url: { type: String },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const predefinedDocuments = [
  {
    name: 'Title Deed/Pre Title Deed/Lease Deed/Oqood/Initial Contract of Sale',
  },
  {
    name: 'NOC from Developer and final as built drawings If extended/improved',
  },
  {
    name: 'Owners NOC if he is not client (for corporate and individual instructions)',
  },
  {
    name: 'Completion Status Certificate from Engineering Co, if under construction',
  },
  { name: 'Floor Plans' },
  { name: 'MOU of Sale' },
  { name: 'SPA of Purchased Property' },
  { name: 'Costs/Invoices Sheet of the Upgrades if any' },
  { name: 'Upgrade Development Consultancy Contract' },
  { name: 'Upgrade Development Contracting Contract' },
]

const TransactionTrackerSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    assetReferenceNumber: { type: String, required: false },
    customerName: { type: String, required: true },
    assetType: { type: String, required: true },
    assetDescription: { type: String },
    customerReferenceNumber: { type: String },
    documents: {
      type: [DocumentStatusSchema],
      default: predefinedDocuments.map((doc) => ({
        name: doc.name,
        status: 'pending',
      })),
    },
    stages: {
      evaluationDocumentPending: { type: Boolean, default: true },
      evaluationComplete: { type: Boolean, default: false },
      _3dRequestsent: { type: Boolean, default: false },
      _3dDone: { type: Boolean, default: false },
      technicalReportRequestsent: { type: Boolean, default: false },
      technicalReportDone: { type: Boolean, default: false },
      trusteeContacted: { type: Boolean, default: false },
      assetTransferred: { type: Boolean, default: false },
    },

    currentStage: {
      type: String,
      enum: [
        'evaluationDocumentPending',
        'evaluationComplete',
        '3dRequestsent',
        '3dDone',
        'technicalReportRequestsent',
        'technicalReportDone',
        'trusteeContacted',
        'assetTransferred',
      ],
      default: 'evaluationDocumentPending',
    },
  },
  { timestamps: true }
)

const TransactionTracker = mongoose.model(
  'TransactionTracker',
  TransactionTrackerSchema
)

export default TransactionTracker
