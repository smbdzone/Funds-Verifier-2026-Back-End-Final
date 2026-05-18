import asyncHandler from 'express-async-handler'
import validateMongoId from '../ulits/validateMongodbId.js'
import Color from '../models/colorModel.js'

const createColor = asyncHandler(async (req, res) => {
  try {
    const color = await Color.create(req.body)
    res.json(color)
  } catch (err) {
    throw new Error(err)
  }
})

const updateColor = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const color = await Color.findByIdAndUpdate(id, req.body, {
      new: true,
    })
    res.json(color)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const DeleteColor = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const color = await Color.findByIdAndDelete(id, req.body, {
      isDeleted: false,
    })
    res.json(color)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const getSingleColor = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const color = await Color.findById(id, { isDeleted: false })
    res.json(color)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const getAllColor = asyncHandler(async (req, res) => {
  try {
    const color = await Color.find({ isDeleted: false })
    res.json(color)
  } catch (err) {
    throw new Error(err)
  }
})
export { createColor, updateColor, DeleteColor, getSingleColor, getAllColor }
