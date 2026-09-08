import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const blogCommentSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    blogUuid: {
      type: String,
      required: true,
      index: true,
    },
    blogTitle: { type: String, default: '' },
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, required: true, maxlength: 120 },
    comment: { type: String, required: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

const BlogComment = mongoose.model('BlogComment', blogCommentSchema)

export default BlogComment
