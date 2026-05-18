import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const AdminSchema = new mongoose.Schema({
  profileImage: { type: String }, // URL of the profile image
  uuid: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true,
  },
  // Soft delete fields
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
})

const User = mongoose.model('Admin', AdminSchema)

export default User
