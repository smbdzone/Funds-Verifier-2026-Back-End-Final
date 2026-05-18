import asyncHandler from 'express-async-handler'
import validateMongoId from '../ulits/validateMongodbId.js'
import Category from '../models/blogCategoryModel.js'

const createCategory = asyncHandler(async (req, res) => {
  try {
    const userId = req.query.userId

    const category = await Category.create(req.body)
    res.json(category)
  } catch (err) {
    throw new Error(err)
  }
})

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)
    const category = await Category.findByIdAndUpdate(id, req.body, {
      new: true,
      isDeleted: false,
    })

    res.json(category)
  } catch (err) {
    throw new Error(err)
  }
})

const DeleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)

    const category = await Category.findById(id, { isDeleted: false })

    if (!category || category.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Category not found or already deleted' })
    }

    // Soft delete: mark as deleted
    category.isDeleted = true
    category.deletedAt = new Date()
    await category.save()

    res.json({ message: 'Category soft-deleted successfully', category })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

const getSingleCategory = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const category = await Category.findById(id, { isDeleted: false })
    res.json(category)
  } catch (err) {
    throw new Error(err)
  }
})

const getAllCategory = asyncHandler(async (req, res) => {
  try {
    const category = await Category.find({ isDeleted: false })
    res.json(category)
  } catch (err) {
    throw new Error(err)
  }
})
export {
  createCategory,
  updateCategory,
  DeleteCategory,
  getSingleCategory,
  getAllCategory,
}
