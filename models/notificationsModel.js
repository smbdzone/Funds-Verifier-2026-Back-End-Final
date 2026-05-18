import mongoose from 'mongoose'
const { Schema } = mongoose
import { v4 as uuidv4 } from 'uuid'

const NotificationSchema = new Schema(
  {
    userId: { type: String, required: false },
    userUUID: { type: String, required: true }, // Public identifier
    UserRole: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: false },
    isRead: { type: Boolean, default: false },
    RelateRoute: { type: String },
    RelatedId: { type: String },
    RelatedUUID: { type: String },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
)

const Notifications = mongoose.model('Notifications', NotificationSchema)

export default Notifications
