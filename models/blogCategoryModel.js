import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const blogCategorySchema = new mongoose.Schema({
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
    unique: true,
    index: true,
  },
})

const Category = mongoose.model('BlogCategory', blogCategorySchema)

export default Category
