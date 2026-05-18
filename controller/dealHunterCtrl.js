import validateMongoId from '../utils/validateMongodbId.js'
import DealHunter from '../models/dealHunterModel.js'
import asyncHandler from 'express-async-handler'

// function for creating user

const createUser = asyncHandler(async (req, res) => {
  try {
    const requester = req.user

    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Only users with DealHunter role (or Admin if you want override) can create a DealHunter profile
    if (requester.role !== 'DealHunter' && requester.role !== 'Admin') {
      return res
        .status(403)
        .json({ message: 'Forbidden: Only DealHunter users can create this profile' })
    }

    // Ensure the profile being created belongs to the logged-in user
    if (
      requester.role !== 'Admin' && // Admin may create on behalf of others
      req.body?.profile?.email &&
      requester.email &&
      req.body.profile.email !== requester.email
    ) {
      return res.status(403).json({
        message: 'Forbidden: Cannot create DealHunter profile for another user',
      })
    }

    const createPdt = await DealHunter.create(req.body);
    res.json(createPdt);
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for getting single user

const getSingleUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const singleUser = await DealHunter.findById(id, { isDeleted: false })
      .populate('financialInfo.verificationCertificate')
      .populate({
        path: 'documentation',
        populate: { path: 'document' },
      })
    res.json(singleUser)
  } catch (err) {
    return res.status(500).json(err)
  }
})

// function for getting all user
const getAllUser = asyncHandler(async (req, res) => {
  try {
    const allUser = await DealHunter.find({ isDeleted: false })
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

    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Admin can update any DealHunter profile
    if (requester.role !== 'Admin') {
      const profile = await DealHunter.findById(id)
      if (!profile) {
        return res.status(404).json({ message: 'DealHunter profile not found' })
      }

      // Enforce that a DealHunter can only update their own profile (match email)
      if (
        requester.email &&
        profile.profile?.email &&
        profile.profile.email !== requester.email
      ) {
        return res.status(403).json({
          message: 'Forbidden: Cannot update another DealHunter profile',
        })
      }
    }

    if (req.body.documentation) {
      // Corrected spelling of "documentation"
      const singleUser = await DealHunter.findByIdAndUpdate(
        id,
        {isDeleted: false},
        {
          $push: {
            documentation: req.body.documentation, // Use correct field
          },
        },
        {
          new: true, // This ensures the updated document is returned
        }
      )
      return res.json(singleUser)
    } else {
      const singleUser = await DealHunter.findByIdAndUpdate(id, req.body, {
        new: true,
      })
      return res.json(singleUser)
    }
  } catch (err) {
    // Keep error logging for debugging
    console.log(err?.message)
    throw new Error(err)
  }
})

// function for deleting user

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)
    const singleUser = await DealHunter.findByIdAndDelete(id)
    res.json(singleUser)
  } catch (err) {
    return res.status(500).json(err)
  }
})

// function for block user

const blockUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)
    const update = { userState: 'block' }
    const singleUser = await DealHunter.findByIdAndUpdate(id, update, {
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
    const singleUser = await DealHunter.findByIdAndUpdate(id, update, {
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
