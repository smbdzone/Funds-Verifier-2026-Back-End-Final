import mongoose from 'mongoose'
const Schema = mongoose.Schema
import { v4 as uuidv4 } from 'uuid'
import { attachListingMediaRefreshHook } from '../helper/refreshAssetSignedUrls.js'

// Define car advertisement schema
const CarAdSchema = new Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    assetType: { type: String, required: true },
    country: { type: String, required: true },
    city: { type: String, required: true },
    neighbourhood: { type: String, required: true },
    make: { type: String, required: true },
    category: { type: String },
    model: { type: String },
    title: { type: String },
    slug: { type: String },
    price: {
      type: Number,
      required: true,
    },
    status: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    underProcess: { type: Boolean, default: false },
    roi: {
      type: Number,
    },

    priceRange: String,
    fuelType: String,
    size: String,
    // feedback: { type: String, required: true },
    description: { type: String },
    kilometers: Number,
    year: Number,
    warranty: String,
    carType: String,
    sellerType: { type: String, default: 'Individual' },
    bodyCondition: { type: String },
    noofCylinders: { type: String },
    mechanicalCondition: { type: String },
    seats: { type: String },
    doors: { type: String },
    pictures: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageAsset' },
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'VideoAsset' },
    thumbnailImg: { type: mongoose.Schema.Types.ObjectId, ref: 'ThumbnailImg' },
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
    evaluationCertificate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    evaluationCertificateDate: { type: Date, required: false },
    transactionDepositDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
    },
    transactionStatus: {
      type: String,
      default: 'pending',
      enum: ['complete', 'pending'],
    },
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
    phoneNumber: { type: String },
    dealhunterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    evaluationDateTime: { type: Date, required: false },
    requestDocument: { type: [mongoose.Schema.Types.Mixed], default: [] },
    trusteeNote: { type: String },
    uploadDocument: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EvaluationCertificate',
      },
    ],
    evaluator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    evaluationStatus: {
      type: String,
      default: 'pending',
      enum: ['approved', 'pending'],
    },
    horsepower: { type: String },
    steeringSide: { type: String },
    transmissionType: { type: String },
    engineCapacity: { type: String },
    VIN: { type: String },
    evaluationCompanies: { type: String },
    exteriorColor: [String],
    userUUID: { type: String, required: true }, // Public identifier
    evaluatorUUID: { type: String },
    interiorColor: [String],
    technicalFeatures: [String],
    evaluationPrices: { type: Number },
    extras: [String],
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

    totalrating: {
      type: String,
      default: 0,
    },

    listing: {
      type: String,
      enum: ['Private', 'Public'],
      default: 'Public',
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Add a virtual for reviews
CarAdSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'productId',
})

// Ensure virtuals are included in JSON output
CarAdSchema.set('toObject', { virtuals: true })
CarAdSchema.set('toJSON', { virtuals: true })

/**
 * Auto-refresh CloudFront signed URLs on every read so that any controller
 * (current or future) that fetches a car with populated media returns working
 * URLs instead of stale ~1-hour signatures persisted at upload time. No-op
 * when media refs are not populated.
 */
CarAdSchema.post('find', attachListingMediaRefreshHook)
CarAdSchema.post('findOne', attachListingMediaRefreshHook)
CarAdSchema.post('findOneAndUpdate', attachListingMediaRefreshHook)

// Create and export model
const Car = mongoose.model('Car', CarAdSchema)
export default Car
