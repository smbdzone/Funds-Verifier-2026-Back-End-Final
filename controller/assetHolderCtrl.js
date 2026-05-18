import validateMongoId from '../utils/validateMongodbId.js'
import AssetHolder from '../models/assetHolderModel.js'
import asyncHandler from 'express-async-handler'

// function for creating user

const createUser = asyncHandler(async (req, res) => {
  try {
    const createPdt = await AssetHolder.create(req.body)
    return res.json(createPdt)
  } catch (err) {
    throw new Error(err)
  }
})

// function for getting single user

const getSingleUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const singleUser = await AssetHolder.findById(id, { isDeleted: false })
    return res.json(singleUser)
  } catch (err) {
    return res.status(500).json(err)
  }
})

// function for getting all user
const getAllUser = asyncHandler(async (req, res) => {
  try {
    const allUser = await AssetHolder.find({ isDeleted: false })
    res.json(allUser)
  } catch (err) {
    throw new Error(err)
  }
})

// function for updating user

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)
    if (req.body.documentation) {
      // Corrected spelling of "documentation"
      const singleUser = await AssetHolder.findByIdAndUpdate(
        id,
        {
          $push: {
            documentation: req.body.documentation, // Use correct field
          },
        },
        {
          new: true, // This ensures the updated document is returned
        }
      )
      res.json(singleUser)
    } else {
      const singleUser = await AssetHolder.findByIdAndUpdate(id, req.body, {
        new: true,
        isDeleted: false,
      })
      res.json(singleUser)
    }
  } catch (err) {
    throw new Error(err)
  }
})

// function for deleting user
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const singleUser = await AssetHolder.findByIdAndDelete(id, {
      isDeleted: false,
    })

    return res.json(singleUser)
  } catch (err) {
    throw new Error(err)
  }
})

// function for block user
const blockUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)
    const update = { userState: 'block' }
    const singleUser = await AssetHolder.findByIdAndUpdate(id, update, {
      new: true,
    })

    res.json(singleUser)
  } catch (err) {
    throw new Error(err.message || 'Error updating user')
  }
})

// function for unblock user

const unblockUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)
    const update = { userState: 'unblock' }
    const singleUser = await AssetHolder.findByIdAndUpdate(id, update, {
      new: true,
    })

    res.json(singleUser)
  } catch (err) {
    throw new Error(err.message || 'Error updating user')
  }
})

export {
  createUser,
  getSingleUser,
  getAllUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
}
