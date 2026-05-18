import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const blogSchema = new mongoose.Schema(
  {
    uuid: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    // Soft delete fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    banner: { type: String, required: true },
    imagealttext: {
      type: String,
      required: true,
    },
    services: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    category: {
      type: [String],
      required: true,
      validate: {
        validator: function (value) {
          return typeof value === 'string' || Array.isArray(value)
        },
        message: 'Category must be a string or an array of strings.',
      },
    }, // Allow both string and array
    faqs: [
      {
        question: { type: String, required: false },
        answer: { type: String, required: false },
      },
    ],
    SEO: {
      title: { type: String, required: true },
      description: { type: String, required: true },
      image: { type: String, required: true },
      imageAlt: { type: String, required: false },
    },
    schemas: {
      article: { type: String },
      FAQ: { type: String },
      localBusiness: { type: String },
      product: { type: String },
    },
    status: {
      type: String,
      default: 'Active',
    },
  },
  { timestamps: true } // Ensure this is placed as part of the schema options
)

const Blog = mongoose.model('Blog', blogSchema)

export default Blog
