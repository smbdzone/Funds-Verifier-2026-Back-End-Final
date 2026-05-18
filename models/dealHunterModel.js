import mongoose from 'mongoose'
// import bcrypt from "bcrypt";
// import crypto from "crypto";
import { v4 as uuidv4 } from 'uuid'

const propertyTypesEnum = [
  'Apartments',
  'Workers Housing',
  'Villa',
  'Student Housing',
  'Building',
  'Industrial',
  'Office',
  'Land',
  'Retail',
]

const regionsEnum = [
  'US',
  'Europe',
  'Canada',
  'Africa',
  'United Arab Emirates',
  'Asia',
  'America',
  'Oceania',
]

const transactionStatusEnum = [
  'Pending',
  'Processing',
  'Completed',
  'Cancelled',
]
const assetDetailsEnum = ['Pending', 'Processing', 'Completed', 'Cancelled']
const timelineOfActivitiesEnum = [
  'Pending',
  'Processing',
  'Completed',
  'Cancelled',
]
const escrowAccountInformationEnum = [
  'Pending',
  'Processing',
  'Completed',
  'Cancelled',
]
const progressTrackingEnum = ['Pending', 'Processing', 'Completed', 'Cancelled']

const DocumentationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
  },

  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DealHunterDoc',
    required: true, // Ensure document is provided
  },
})

const userSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    profile: {
      firstname: {
        type: String,
        required: true,
      },
      lastname: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        required: true,
        unique: true,
      },
      mobile: {
        type: Number,
        required: true,
        unique: true,
      },
      maritalStatus: {
        type: String,
        required: true,
      },
      avatar: {
        type: String,
        required: true,
      },
      dateOfBirth: {
        type: String,
        required: true,
      },
    },
    financialInfo: {
      verificationCertificate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealHunterDoc',
      },
      fundsVerification: String,
      bankName: String,
      bankBranch: String,
      city: String,
      country: String,
      status: {
        type: String,
        enum: ['Pending', 'Approved'],
      },
    },
    personalDetails: {
      residenceStatus: String,
      citizenship: String,
      industry: String,
      employerName: String,
    },

    documentation: [DocumentationSchema],
    userState: { type: String, default: 'inactive' },

    propertyTypes: {
      type: [String],
      enum: propertyTypesEnum,
    },
    region: {
      type: [String],
      enum: regionsEnum,
    },
    electronicConsent: {
      consentTerms: {
        type: Boolean,
        default: false,
      },
      consentTaxTems: {
        type: Boolean,
        default: false,
      },
    },
    purchaseTracker: {
      transactionStatus: {
        value: {
          type: String,
          enum: transactionStatusEnum,
        },
      },
      assetDetails: {
        value: {
          type: String,
          enum: assetDetailsEnum,
        },
      },
      timelineOfActivities: {
        value: {
          type: String,
          enum: timelineOfActivitiesEnum,
        },
      },
      escrowAccountInformation: {
        value: {
          type: String,
          enum: escrowAccountInformationEnum,
        },
      },
      progressTracking: {
        value: {
          type: String,
          enum: progressTrackingEnum,
        },
      },
    },

    refreshToken: {
      type: String,
    },

    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetTokenExpiresAt: Date,
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
)

// userSchema.pre('save', async function(next) {
//   if (this.isModified('password')) {
//     this.password = await bcrypt.hash(this.password, 10);
//     this.confirmPassword = this.password;

//   }
//   next();
// });

// userSchema.methods.isPasswordMatch = async function(enterdPassword){
// return await bcrypt.compare(enterdPassword, this.password)
// }

// userSchema.methods.createPasswordResetToken = async function(){
//   const resetToken = crypto.randomBytes(32).toString("hex");
//   this.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
//   this.passwordResetTokenExpiresAt = Date.now() + 30 * 60 * 1000;
//   return resetToken
// }

const DealHunter = mongoose.model('DealHunter', userSchema)

export default DealHunter
