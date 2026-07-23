import mongoose from 'mongoose'
const Schema = mongoose.Schema
import { v4 as uuidv4 } from 'uuid'
import { attachListingMediaRefreshHook } from '../helper/refreshAssetSignedUrls.js'

// Define jewelry advertisement schema
const JewelryAdSchema = new Schema(
  {
    assetType: { type: String, required: true },
    country: { type: String, required: true },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    /** Unique listing number issued by the DLD (Dubai Land Department). */
    dldNumber: { type: String, default: '', trim: true },
    /** Public visibility counters: impressions = shown on cards, clicks = detail views. */
    analytics: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
    },

    city: { type: String, required: true },
    neighbourhood: { type: String, required: true },
    /** Optional Google Maps share/embed URL shown on the listing. */
    mapUrl: { type: String, default: '', trim: true },
    make: { type: String },
    grams: { type: String },
    priceRange: String,
    title: { type: String, maxlength: 50 },
    condition: String,
    price: { type: Number, required: true },
    weight: String,
    sellerType: { type: String, default: 'Individual' },
    category: { type: String, required: true },
    model: { type: String, required: true },
    description: { type: String, maxlength: 300 },
    feedback: { type: String, required: true },
    age: String,
    usage: String,
    pictures: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageAsset' },
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAsset' },
    thumbnailImg: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailImg' },
    qrScan: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageAsset' },
    transferDocuments: {
      assetTransferDocument: { type: String },
      PaymentProof: { type: String },
      successFee: { type: Number },
      paymentUrl: { type: String },
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
    evaluationCertificate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    evaluationCertificateDate: { type: Date, required: false },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    evaluationC: {
      type: String,
      default: 'N/A',
    },
    video3DWalkthrough: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request3D',
    },
    transactionDepositDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    transactionStatus: {
      type: String,
      default: 'pending',
      enum: ['completed', 'pending'],
    },
    technicalReport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReportTechnical',
    },
    isRecommendedAsset: { type: Boolean, default: false },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    dealhunterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    trusteeNote: { type: String },
    evaluationDateTime: { type: Date, required: false },
    requestDocument: { type: [mongoose.Schema.Types.Mixed], default: [] },
    phoneNumber: { type: Number, required: true },
    uploadDocument: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EvaluationCertificate',
      },
    ],
    status: {
      type: Number,
      enum: [0, 1],
      default: 0, // Default to "pending"
    },
    underProcess: { type: Boolean, default: false },
    roi: {
      type: Number,
    },
    evaluator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    evaluatorUUID: { type: String },

    userUUID: { type: String, required: true }, // Public identifier
    evaluationStatus: {
      type: String,
      default: 'pending',
      enum: ['approved', 'pending'],
    },
    evaluationCompanies: {
      type: String,
    },
    warranty: String,
    materials: [
      {
        type: String,
      },
    ],
    length: Number,
    jewelryStyles: { type: String },
    jewelryMetal: [String],
    evaluationPrices: { type: Number },
    locateJewelry: {
      type: String,
    },

    listing: {
      type: String,
      enum: ['Private', 'Public'],
      default: 'Public',
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
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

    // totalrating: {
    //   type: String,
    //   default: 0,
    // },
  },
  { timestamps: true }
)

// Add a virtual for reviews
JewelryAdSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId',
})

// Ensure virtuals are included in JSON output
JewelryAdSchema.set('toObject', { virtuals: true })
JewelryAdSchema.set('toJSON', { virtuals: true })

/**
 * Auto-refresh CloudFront signed URLs on every read so that any controller
 * (current or future) that fetches jewelry with populated media returns
 * working URLs instead of stale ~1-hour signatures persisted at upload time.
 * No-op when media refs are not populated.
 */
JewelryAdSchema.post('find', attachListingMediaRefreshHook)
JewelryAdSchema.post('findOne', attachListingMediaRefreshHook)
JewelryAdSchema.post('findOneAndUpdate', attachListingMediaRefreshHook)

// Create and export model
const Jewelry = mongoose.model('Jewelry', JewelryAdSchema)
export default Jewelry
