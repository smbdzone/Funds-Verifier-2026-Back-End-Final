import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

export const UNIT_CATEGORIES = [
  'Off-Plan',
  'Completed',
  'Villa',
  'Apartment',
  'Penthouse',
]

export const UNIT_STATUSES = [
  'Draft',
  'Pending',
  'Available',
  'Reserved',
  'Under Offer',
  'Sold',
]

const paymentStepSchema = new mongoose.Schema(
  {
    step: { type: Number },
    stepLabel: { type: String, default: '' },
    paymentLabel: { type: String, default: '' },
    sharePercent: { type: String, default: '' },
    milestone: { type: String, default: '' },
  },
  { _id: false },
)

const developerUnitSchema = new mongoose.Schema(
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
    /** Inventory code (auto-filled from title when omitted). */
    unitNumber: { type: String, required: true, trim: true },
    /** Off-plan style listing title (shown publicly). */
    title: { type: String, default: '', trim: true, maxlength: 50 },
    phoneNumber: { type: String, default: '', trim: true },
    floor: { type: String, default: '', trim: true },
    category: {
      type: String,
      enum: UNIT_CATEGORIES,
      default: 'Apartment',
    },
    builtUpArea: { type: Number, default: null },
    builtUpAreaTo: { type: Number, default: null },
    sizeUnit: {
      type: String,
      enum: ['SQFT', 'SQM'],
      default: 'SQFT',
    },
    orientation: { type: String, default: '', trim: true },
    view: { type: String, default: '', trim: true },
    listingPrice: { type: Number, default: null },
    priceFrom: { type: Number, default: null },
    priceTo: { type: Number, default: null },
    currency: { type: String, default: 'AED', trim: true },
    listing: {
      type: String,
      enum: ['Public', 'Private', ''],
      default: 'Public',
    },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    additionalDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    developerName: { type: String, default: '', trim: true },
    dldNumber: { type: String, default: '', trim: true },
    deliveryQuarter: { type: String, default: '', trim: true },
    deliveryYear: { type: String, default: '', trim: true },
    layout: { type: String, default: '', trim: true },
    numberOfFloors: { type: String, default: '', trim: true },
    mapUrl: { type: String, default: '', trim: true },
    paymentPlanType: { type: String, default: '', trim: true },
    paymentPlanSteps: { type: [paymentStepSchema], default: [] },
    /** Legacy ref to project payment plan (optional). */
    paymentPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeveloperPaymentPlan',
      default: null,
    },
    pictures: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    thumbnailImg: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ThumbnailImg',
      default: null,
    },
    qrScan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    unitLayout: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    floorPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageAsset',
      default: null,
    },
    agencyAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EvaluationCertificate',
      default: null,
    },
    facilities: { type: [String], default: [] },
    customFacilities: { type: [String], default: [] },
    status: {
      type: String,
      enum: UNIT_STATUSES,
      default: 'Draft',
    },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    submittedAt: { type: Date, default: null },
    publishedPropertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
    },
    publishedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

developerUnitSchema.index(
  { project: 1, unitNumber: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
)

const DeveloperUnit = mongoose.model('DeveloperUnit', developerUnitSchema)

export default DeveloperUnit
