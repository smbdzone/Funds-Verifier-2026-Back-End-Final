import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import RequestedItemsPrice from '../models/RequestedItemsPriceModel.js'

// Create
const CreateRequestedItemsPrice = asyncHandler(async (req, res) => {
  try {
    const data = req.body

    if (!data?.userId) throw { message: 'User ID is required!', status: 400 }
    if (!data?.requestedFor)
      throw { message: 'Requested for item is required!', status: 400 }
    if (!data?.AssetType)
      throw { message: 'Asset type is required!', status: 400 }
    if (!data?.Category) throw { message: 'Category is required!', status: 400 }
    if (!data?.price) throw { message: 'Price is required!', status: 400 }

    if (!['technicalreport', '3dwalkthrough'].includes(data?.requestedFor)) {
      throw {
        message: 'Requested for can only be 3dwalkthrough or technicalreport!',
        status: 400,
      }
    }

    const addPrice = new RequestedItemsPrice(data)
    await addPrice.save()

    return res.status(201).json({
      success: true,
      payload: addPrice,
      message: 'Registration successful!',
    })
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: true, message: error?.message || 'Internal server error' })
  }
})

// Update
const updateRequestedItemsPrice = asyncHandler(async (req, res) => {
  const { id } = req.params
  const data = req.body

  try {
    validateMongoId(id)
    const updatedPrice = await RequestedItemsPrice.findByIdAndUpdate(id, data, {
      new: true,
    })

    if (!updatedPrice) {
      return res
        .status(404)
        .json({ error: true, message: 'Requested price not found!' })
    }

    return res
      .status(200)
      .json({ message: 'Price updated successfully!', payload: updatedPrice })
  } catch (err) {
    return res
      .status(error?.status || 500)
      .json({ error: true, message: error?.message || 'Internal server error' })
  }
})

// Delete
const deleteRequestedItemsPrice = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)

    const price = await RequestedItemsPrice.findById(id, { isDeleted: false })

    if (!price || price.isDeleted) {
      return res.status(404).json({
        error: true,
        message: 'Requested price not found or already deleted!',
      })
    }

    // Soft delete
    price.isDeleted = true
    price.deletedAt = new Date()
    await price.save()

    return res.json({
      success: true,
      message: 'Requested price soft-deleted successfully!',
      price,
    })
  } catch (error) {
    return res
      .status(error?.status || 500)
      .json({ error: true, message: error?.message || 'Internal server error' })
  }
})

// Find
const FindRequestedItemsPrice = asyncHandler(async (req, res) => {
  const { requestedFor, AssetType, Category, PropertyType } = req.query
  try {
    if (!requestedFor)
      throw { message: 'Requested for item is required!', status: 400 }
    if (!AssetType) throw { message: 'Asset type is required!', status: 400 }
    if (!Category) throw { message: 'Category is required!', status: 400 }

    const filter = {}
    if (requestedFor) filter.requestedFor = requestedFor
    if (AssetType) filter.AssetType = AssetType
    if (Category) filter.Category = Category
    if (PropertyType) filter.PropertyType = PropertyType
    filter.isDeleted = false
    const searchedPrices = await RequestedItemsPrice.findOne(filter)

    return res.status(200).json({
      success: true,
      payload: searchedPrices,
      message: 'Prices found successfully!',
    })
  } catch (error) {
    console.log(error)
    return res
      .status(error?.status || 500)
      .json({ error: true, message: error?.message || 'Internal server error' })
  }
})

const FindRequestedItemsPriceById = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    const findById = await RequestedItemsPrice.findById(id, {
      isDeleted: false,
    })
    if (findById) {
      return res.status(200).json({ success: true, payload: findById })
    } else {
      return res.status(400).json({
        error: true,
        payload: null,
        message: 'No data found with this ID',
      })
    }
  } catch (error) {
    console.log(error)
    return res
      .status(error?.status || 500)
      .json({ error: true, message: error?.message || 'Internal server error' })
  }
})

export {
  CreateRequestedItemsPrice,
  updateRequestedItemsPrice,
  deleteRequestedItemsPrice,
  FindRequestedItemsPrice,
  FindRequestedItemsPriceById,
}
