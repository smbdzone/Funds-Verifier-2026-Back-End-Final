import CreateAssets from '../models/create-assets.model.js'
import asyncHandler from 'express-async-handler'
import fs from 'fs' // To handle file deletion (if necessary)

// Create Asset
export const createAsset = asyncHandler(async (req, res) => {
  try {
    const assetData = {
      ...req.body,
      pictures: req.files.pictures?.map((file) => file.path) || [],
      video: req.files.video ? req.files.video[0].path : null,
      thumbnailImg: req.files.thumbnailImg
        ? req.files.thumbnailImg[0].path
        : null,
      evaluationCertificate: req.files.evaluationCertificate
        ? req.files.evaluationCertificate[0].path
        : null,
    }

    const newAsset = await CreateAssets.create(assetData) // Create new asset
    res.status(201).json(newAsset) // Respond with created asset
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to create asset', error: error.message })
  }
})

// Get Single Asset
export const getSingleAsset = asyncHandler(async (req, res) => {
  try {
    const asset = await CreateAssets.findById(req.params.id, {
      isDeleted: false,
    }) // Find asset by ID
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' })
    }
    res.json(asset)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to fetch asset', error: error.message })
  }
})

// Get All Assets
export const getAllAssets = asyncHandler(async (req, res) => {
  try {
    const assets = await CreateAssets.find({ isDeleted: false }) // Find all assets
    res.json(assets)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to fetch assets', error: error.message })
  }
})

// Update Asset
export const updateAsset = asyncHandler(async (req, res) => {
  try {
    const asset = await CreateAssets.findById(req.params.id, {
      isDeleted: false,
    })
    if (!asset) {
      return res.status(404).json({ message: 'Asset not found' })
    }

    // Prepare updated data
    const updatedData = {
      ...req.body,
      pictures: req.files.pictures?.map((file) => file.path) || asset.pictures,
      video: req.files.video ? req.files.video[0].path : asset.video,
      thumbnailImg: req.files.thumbnailImg
        ? req.files.thumbnailImg[0].path
        : asset.thumbnailImg,
      evaluationCertificate: req.files.evaluationCertificate
        ? req.files.evaluationCertificate[0].path
        : asset.evaluationCertificate,
    }

    // Update asset and return the updated asset
    const updatedAsset = await CreateAssets.findByIdAndUpdate(
      req.params.id,
      updatedData,
      {
        new: true,
      }
    )

    res.json(updatedAsset) // Send updated asset
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to update asset', error: error.message })
  }
})

export const deleteAsset = asyncHandler(async (req, res) => {
  try {
    const asset = await CreateAssets.findById(req.params.id, {
      isDeleted: false,
    })

    if (!asset || asset.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Asset not found or already deleted' })
    }

    // Optional: remove associated files from server (if desired)
    if (asset.pictures && asset.pictures.length) {
      asset.pictures.forEach((picturePath) => {
        if (fs.existsSync(picturePath)) {
          fs.unlinkSync(picturePath)
        }
      })
    }

    // Soft delete
    asset.isDeleted = true
    asset.deletedAt = new Date()
    await asset.save()

    res.json({ message: 'Asset soft-deleted successfully', asset })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Failed to delete asset', error: error.message })
  }
})
