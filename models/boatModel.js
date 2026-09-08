import mongoose from 'mongoose'
const Schema = mongoose.Schema
import { v4 as uuidv4 } from 'uuid'
import { applyMarketplaceListingIndexes } from '../utils/listingIndexes.js'

// Define boats advertisement schema
const BoatAdSchema = new Schema(
  {
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

    assetType: { type: String, required: true },
    country: { type: String, required: true },
    city: { type: String, required: true },
    neighbourhood: { type: String, required: true },
    /** Optional Google Maps share/embed URL shown on the listing. */
    mapUrl: { type: String, default: '', trim: true },
    priceRange: String,
    title: { type: String, maxlength: 50 },
    phoneNumber: { type: String, required: true },
    condition: String,
    price: { type: Number, required: true },
    weight: String,
    slug: String,
    sellerType: { type: String, default: 'Individual' },
    description: { type: String, maxlength: 300 },
    length: String,
    brands: { type: String },
    age: String,
    usage: String,
    locateBoat: { type: String },
    sportsOutdoorPrice: { type: String },
    warranty: String,
    seats: String,
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
    feedback: { type: String, required: true },
    evaluationDateTime: { type: Date, required: false },
    evaluationC: {
      type: String,
      default: 'N/A',
    },
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
    isRecommendedAsset: { type: Boolean, default: false },
    requestDocument: { type: [mongoose.Schema.Types.Mixed], default: [] },
    uploadDocument: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EvaluationCertificate',
      },
    ],
    transactionDepositDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    dealhunterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    viewingStatus: { type: String },
    depositReceipt: { type: String },
    userUUID: { type: String, required: true }, // Public identifier
    evaluatorUUID: { type: String },

    trusteeNote: { type: String },
    status: {
      type: Number,
      enum: [0, 1],
      default: 0, // Default to "pending"
    },
    underProcess: { type: Boolean, default: false },
    roi: {
      type: Number,
    },
    transactionStatus: {
      type: String,
      default: 'pending',
      enum: ['complete', 'pending'],
    },
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
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    evaludationComponents: { type: String },
    exteriorColor: [String],
    interiorColor: [String],
    extras: [String],
    category: { type: String, required: true },
    model: { type: String, required: true },
    listing: {
      type: String,
      enum: ['Private', 'Public'],
      default: 'Public',
    },
    evaluationPrices: { type: Number },
  },
  { timestamps: true }
)

// Add a virtual for reviews
BoatAdSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId',
})

// Ensure virtuals are included in JSON output
BoatAdSchema.set('toObject', { virtuals: true })
BoatAdSchema.set('toJSON', { virtuals: true })

/**
 * Media signed URLs: ImageAsset/Video/Thumbnail hooks sign on populate;
 * controllers refresh for .lean() paths. Listing-level hooks removed to
 * avoid re-signing the same entries on every list/detail read.
 */

applyMarketplaceListingIndexes(BoatAdSchema, {
  includeSlug: true,
})

// Create and export model
const Boat = mongoose.model('Boat', BoatAdSchema)
export default Boat
