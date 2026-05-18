import asyncHandler from 'express-async-handler'
import validateMongoId from '../ulits/validateMongodbId.js'
import Brand from '../models/brandModel.js'
import { createNotification } from './notifications.controller.js'

const createBrand = asyncHandler(async (req, res) => {
  const userId = req.query.userId
  try {
    const brand = await Brand.create(req.body)
    res.json(brand)
  } catch (err) {
    throw new Error(err)
  }
})

const updateBrand = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)
    const brand = await Brand.findByIdAndUpdate(id, req.body, {
      isDeleted: false,
      new: true,
    })
    res.json(brand)
  } catch (err) {
    throw new Error(err)
  }
})

const DeleteBrand = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)

    const brand = await Brand.findById(id, { isDeleted: false })

    if (!brand || brand.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Brand not found or already deleted' })
    }

    // Soft delete
    brand.isDeleted = true
    brand.deletedAt = new Date()
    await brand.save()

    res.json({ message: 'Brand soft-deleted successfully', brand })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

const getSingleBrand = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const brand = await Brand.findById(id, { isDeleted: false })
    res.json(brand)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const getAllBrand = asyncHandler(async (req, res) => {
  try {
    const brand = await Brand.find({ isDeleted: false })
    res.json(brand)
  } catch (err) {
    throw new Error(err)
  }
})
export { createBrand, updateBrand, DeleteBrand, getSingleBrand, getAllBrand }
