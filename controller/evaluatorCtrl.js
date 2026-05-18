import validateMongoId from '../utils/validateMongodbId.js'
import EvaluatorProfile from '../models/evaluatorModel.js'
import asyncHandler from 'express-async-handler'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import Car from '../models/carModel.js'
import Property from '../models/propertyModel.js'
import User from '../models/userModel.js'

// function for creating user

const createUser = asyncHandler(async (req, res) => {
  try {
    const requester = req.user

    // Only Admin or Evaluator can create evaluator profiles
    if (
      !requester ||
      !['Admin', 'Evaluator', 'Sub-Evaluator'].includes(requester.role)
    ) {
      return res.status(403).json({ message: 'Forbidden: Not allowed' })
    }

    const data = req.body
    const createPdt = await EvaluatorProfile.create(data)
    res.json(createPdt)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})
// getAllEvaluatorsByParentId
const getAllEvaluatorsByParentId = asyncHandler(async (req, res) => {
  try {
    const parentid = req.params.parentid
    console.log(parentid)

    // validateMongoId(parentid)
    const createPdt = await User.find({
      parentEvaluator: parentid,
      isDeleted: false,
    })
    return res.status(200).json(createPdt)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})
// AllAssignedAssetstoEvaluator
const AllAssignedAssetstoEvaluator = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id
    validateMongoId(id)

    const getProductsWithType = async (Model, itemType) => {
      const products = await Model.find({ evaluator: id, isDeleted: false })
      return (products || [])?.map((product) => ({
        ...product?.toObject(),
        itemType,
      }))
    }

    const [boats, jewelry, cars, properties] = await Promise.all([
      getProductsWithType(Boat, 'boat'),
      getProductsWithType(Jewelry, 'jewelry'),
      getProductsWithType(Car, 'car'),
      getProductsWithType(Property, 'property'),
    ])
    const allProducts = [...boats, ...jewelry, ...cars, ...properties]
    return res.status(200).json({ success: true, payload: allProducts })
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
    const singleUser = await EvaluatorProfile.findById(id, { isDeleted: false })
    res.json(singleUser)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for getting all user

const getAllUser = asyncHandler(async (req, res) => {
  try {
    const requester = req.user

    // Only Admin or Evaluator can view all evaluator profiles
    if (
      !requester ||
      !['Admin', 'Evaluator', 'Sub-Evaluator'].includes(requester.role)
    ) {
      return res.status(403).json({ message: 'Forbidden: Not allowed' })
    }

    const allUser = await EvaluatorProfile.find({ isDeleted: false }).populate(
      'parentEvaluator'
    )
    return res.status(200).json(allUser)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for updating user

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  // console.log(req.body, "req.body");

  try {
    validateMongoId(id)

    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Admin can update any evaluator profile
    if (requester.role !== 'Admin') {
      // Non-admin: must be updating their own evaluator profile
      const evaluatorProfile = await EvaluatorProfile.findById(id)
      if (!evaluatorProfile) {
        return res.status(404).json({ message: 'Evaluator profile not found' })
      }

      // We link ownership by matching emails between User and EvaluatorProfile
      if (
        !requester.email ||
        !evaluatorProfile.email ||
        evaluatorProfile.email !== requester.email
      ) {
        return res
          .status(403)
          .json({ message: 'Forbidden: Cannot update another evaluator profile' })
      }
    }

    if (req.body.documentation) {
      // Corrected spelling of "documentation"
      const singleUser = await EvaluatorProfile.findByIdAndUpdate(
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
      const singleUser = await EvaluatorProfile.findByIdAndUpdate(
        id,
        req.body,
        {
          new: true,
        }
      )
      res.json(singleUser)
    }
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for deleting user
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)

    const user = await EvaluatorProfile.findById(id, { isDeleted: false })

    if (!user || user.isDeleted) {
      return res
        .status(404)
        .json({ message: 'User not found or already deleted' })
    }

    // Soft delete
    user.isDeleted = true
    user.deletedAt = new Date()
    await user.save()

    res.json({ message: 'User soft-deleted successfully', user })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for block user

const blockUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)

    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const evaluator = await EvaluatorProfile.findById(id).populate(
      'parentEvaluator'
    )
    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' })
    }

    const isAdmin = requester.role === 'Admin'
    const isParentEvaluator =
      evaluator.parentEvaluator &&
      String(evaluator.parentEvaluator._id) === String(requester._id)

    if (!isAdmin && !isParentEvaluator) {
      return res.status(403).json({ message: 'Forbidden: Not allowed' })
    }

    const update = { userState: 'block' }
    const singleUser = await EvaluatorProfile.findByIdAndUpdate(id, update, {
      new: true,
    })
    res.json(singleUser)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

// function for unblock user

const unblockUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    validateMongoId(id)

    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const evaluator = await EvaluatorProfile.findById(id).populate(
      'parentEvaluator'
    )
    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' })
    }

    const isAdmin = requester.role === 'Admin'
    const isParentEvaluator =
      evaluator.parentEvaluator &&
      String(evaluator.parentEvaluator._id) === String(requester._id)

    if (!isAdmin && !isParentEvaluator) {
      return res.status(403).json({ message: 'Forbidden: Not allowed' })
    }

    const update = { userState: 'unblock' }
    const singleUser = await EvaluatorProfile.findByIdAndUpdate(id, update, {
      new: true,
    })
    res.json(singleUser)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
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
  getAllEvaluatorsByParentId,
  AllAssignedAssetstoEvaluator,
}
