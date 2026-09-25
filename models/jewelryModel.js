import mongoose from 'mongoose'
const Schema = mongoose.Schema
import { v4 as uuidv4 } from 'uuid'
import { applyMarketplaceListingIndexes } from '../utils/listingIndexes.js'

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
    /** Public visibility counters: incremented when a visitor opens this listing. */
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
    weightUnit: {
      type: String,
      enum: ['gm', 'kg', 'lb', 'oz'],
      default: 'gm',
    },
    priceRange: String,
    title: { type: String, maxlength: 60 },
    condition: String,
    price: { type: Number, required: true },
    weight: String,
    sellerType: { type: String, default: 'Individual' },
    category: { type: String, required: true },
    model: { type: String, required: true },
    description: { type: String, maxlength: 300 },
    feedback: { type: String, default: '' },
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
    evaluationFeePrice: { type: Number },
    evaluationFeeCategory: { type: String },
    evaluationFeeSubCategory: { type: String },
    evaluationFeeBedrooms: { type: String },
    evaluationFeePaidAmount: { type: Number },
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
 * Media signed URLs: ImageAsset/Video/Thumbnail hooks sign on populate;
 * controllers refresh for .lean() paths. Listing-level hooks removed to
 * avoid re-signing the same entries on every list/detail read.
 */

applyMarketplaceListingIndexes(JewelryAdSchema, {
  includeSlug: false,
  includeMake: true,
})

// Create and export model
const Jewelry = mongoose.model('Jewelry', JewelryAdSchema)
export default Jewelry
