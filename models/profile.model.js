import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const { Schema } = mongoose

const ProfileSchema = new Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  email: { type: String, required: true },
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },

  maritalStatus: { type: String, enum: ['Single', 'Married'], required: true },
  dateOfBirth: { type: Date, required: true },
  avatar: { type: String },
  residenceStatus: { type: String, required: true },
  countryOfCitizenship: { type: String, required: true },
  nameOfEmployer: { type: String, required: true },
  industry: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postCode: { type: String, required: true },
  country: { type: String, required: true },
  annualIncome: { type: Number, required: true },
  netWorth: { type: Number, required: true },
  liquidAssets: { type: Number, required: true },
  bankName: { type: String, required: true },
  bankBranch: { type: String, required: true },
  bankCity: { type: String, required: true },
  bankCountry: { type: String, required: true },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

const Profile = mongoose.model('Profile', ProfileSchema)

export default Profile
