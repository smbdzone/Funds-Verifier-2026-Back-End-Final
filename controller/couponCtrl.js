import asyncHandler from 'express-async-handler'
import validateMongoId from '../ulits/validateMongodbId.js'
import Coupon from '../models/couponModel.js'
import { createNotification } from './notifications.controller.js'

const createCoupon = asyncHandler(async (req, res) => {
  try {
    const userId = req.query.userId

    const coupon = await Coupon.create(req.body)
    res.json(coupon)
  } catch (err) {
    throw new Error(err)
  }
})

const getAllCoupon = asyncHandler(async (req, res) => {
  try {
    const coupon = await Coupon.find({ isDeleted: false })
    res.json(coupon)
  } catch (err) {
    throw new Error(err)
  }
})

const updateCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId
  try {
    validateMongoId(id)
    const coupon = await Coupon.findByIdAndUpdate(
      id,
      req.body,
      { isDeleted: false },
      {
        new: true,
      }
    )
    res.json(coupon)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const deleteCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)
    const coupon = await Coupon.findByIdAndDelete(
      id,
      { isDeleted: false },
      req.body
    )
    res.json(coupon)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const getSingleCoupon = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const coupon = await Coupon.findById(id, { isDeleted: false })
    res.json(coupon)
  } catch (err) {
    return res.status(500).json(err)
  }
})

export {
  createCoupon,
  getAllCoupon,
  updateCoupon,
  deleteCoupon,
  getSingleCoupon,
}
