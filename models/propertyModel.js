import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import { attachListingMediaRefreshHook } from '../helper/refreshAssetSignedUrls.js'

// Define property schema
const propertySchema = new mongoose.Schema({
  assetType: { type: String, required: true },
  country: { type: String, required: true },
  requestDocument: { type: [mongoose.Schema.Types.Mixed], default: [] },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  uploadDocument: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
  ],
  transferDocuments: {
    assetTransferDocument: { type: String },
    PaymentProof: { type: String },
  },
  dealClosed: { type: Boolean },
  successFeePaymentStatus: {
    type: String,
    enum: ['Pending', 'Paid'],
    default: 'Pending',
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  feedback: { type: String },
  city: { type: String, required: true },
  phoneNumber: { type: Number, required: true },
  neighbourhood: { type: String, required: true },
  propertyType: { type: String, required: true },
  propertyForSale: { type: String },
  evaluationDateTime: { type: Date, required: false },
  propertyForLease: { type: String },
  leaseNumberofCheques: { type: Number },
  title: { type: String, required: true, maxlength: 50 },
  slug: { type: String },
  pictures: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageAsset' },
  video: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAsset' },
  thumbnailImg: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailImg' },
  evaluationCertificate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationCertificate',
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationCertificate',
  },
  transactionDepositDocument: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EvaluationCertificate',
  },
  transactionStatus: {
    type: String,
    default: 'pending',
    enum: ['completed', 'succeeded', 'pending'],
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
  },
  evaluationC: { type: String, default: 'N/A' },
  evaluator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  evaluationStatus: {
    type: String,
    default: 'pending',
    enum: ['approved', 'pending'],
  },
  video3DWalkthrough: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request3D',
  },
  technicalReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTechnical',
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  evaluatorUUID: { type: String },
  userUUID: { type: String, required: true }, // Public identifier
  dealhunterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  trusteeNote: { type: String },
  price: { type: Number, required: true },
  evaluationPrices: { type: Number },
  status: { type: Number, enum: [0, 1], default: 0 },
  roi: { type: Number },
  sizeSQFT: { type: Number, default: 0 },
  propertyDescription: { type: String, maxlength: 300 },
  description: { type: String, maxlength: 300 },
  additionalDescription: { type: String, maxlength: 1000 },
  bedrooms: { type: Number },
  evaluationCompanies: { type: String },
  developer: { type: String },
  bathrooms: { type: Number },
  isFurnished: { type: String },
  sellerTransferFee: { type: Number },
  buyerTransferFee: { type: Number },
  occupancyStatus: { type: String },
  isfeatured: { type: Number, default: 0 },
  listing: { type: String, enum: ['Private', 'Public'], default: 'Public' },
  facilities: [String],
  ratings: [
    {
      star: Number,
      comment: String,
      postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AssetHolderProfile',
      },
    },
  ],
  totalrating: { type: String, default: 0 },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Add a virtual for reviews
propertySchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId',
})

// Ensure virtuals are included in JSON output
propertySchema.set('toObject', { virtuals: true })
propertySchema.set('toJSON', { virtuals: true })

/**
 * Auto-refresh CloudFront signed URLs on every read so that any controller
 * (current or future) that fetches a property with populated media returns
 * working URLs instead of stale ~1-hour signatures persisted at upload time.
 *
 * No-op when the media refs are not populated, so it's safe for queries that
 * only need the bare document.
 */
propertySchema.post('find', attachListingMediaRefreshHook)
propertySchema.post('findOne', attachListingMediaRefreshHook)
propertySchema.post('findOneAndUpdate', attachListingMediaRefreshHook)

// Create Property model
const Property = mongoose.model('Property', propertySchema)

export default Property
