import Car from '../models/carModel.js'
import asyncHandler from 'express-async-handler'
import { createNotification } from './notifications.controller.js'
import Boat from '../models/boatModel.js'
import Property from '../models/propertyModel.js'
import Jewelry from '../models/jewelryModel.js'
import User from '../models/userModel.js'
import {
  isParentEvaluatorOf,
  isSubEvaluatorRole,
} from '../utils/parentEvaluator.js'
import { sanitizeMongoId, sanitizeUUID } from '../utils/nosqlSanitizer.js'

const findUserByIdOrUuid = async (idOrUuid) => {
  if (!idOrUuid) return null
  const mongoId = sanitizeMongoId(idOrUuid)
  if (mongoId) {
    const byId = await User.findOne({ _id: mongoId, isDeleted: false }).select(
      '_id uuid role parentEvaluator name',
    )
    if (byId) return byId
  }
  const uuid = sanitizeUUID(idOrUuid)
  if (uuid) {
    return User.findOne({ uuid, isDeleted: false }).select(
      '_id uuid role parentEvaluator name',
    )
  }
  return null
}

const getAssetModel = (assetType) => {
  switch (assetType) {
    case 'car':
      return Car
    case 'boat':
      return Boat
    case 'property':
      return Property
    case 'jewelry':
      return Jewelry
    default:
      return null
  }
}

const AssignAssetToEvaluator = asyncHandler(async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ error: true, message: 'Unauthorized' })
    }

    const role = String(requester.role || '').trim()
    const isAdmin = role === 'Admin'
    const isEvaluator = role === 'Evaluator'

    if (!isAdmin && !isEvaluator) {
      return res.status(403).json({
        error: true,
        message: 'Forbidden — only Evaluator or Admin can assign assets',
      })
    }

    const { assetId, assetType, assigneeId, unassign } = req.body
    const shouldUnassign =
      unassign === true ||
      assigneeId === null ||
      assigneeId === '' ||
      assigneeId === 'unassign'

    if (
      !assetType ||
      !['boat', 'car', 'property', 'jewelry']?.includes(assetType)
    ) {
      return res.status(400).json({
        error: true,
        message: `Asset type is required and must be a boat, car, property and jewelry.`,
      })
    }
    if (!assetId) {
      return res
        .status(400)
        .json({ error: true, message: `Asset ID is required.` })
    }
    if (!shouldUnassign && !assigneeId) {
      return res.status(400).json({
        error: true,
        message: `Evaluator id as assigneeId is required.`,
      })
    }

    const assetMongoId = sanitizeMongoId(assetId)
    if (!assetMongoId) {
      return res.status(400).json({
        error: true,
        message: 'Invalid asset ID format.',
      })
    }

    const Model = getAssetModel(assetType)
    if (!Model) {
      return res
        .status(400)
        .json({ error: true, message: `Invalid asset type provided.` })
    }

    if (shouldUnassign) {
      const Asset = await Model.findByIdAndUpdate(
        assetMongoId,
        {
          $unset: { evaluator: 1, evaluatorUUID: 1 },
        },
        { new: true },
      )
      if (!Asset) {
        return res.status(400).json({
          error: true,
          message: `Failed to update or asset with this ID not found.`,
        })
      }
      return res.status(200).json({
        payload: Asset,
        message: 'Evaluator unassigned successfully',
      })
    }

    const assigneeUser = await findUserByIdOrUuid(assigneeId)
    if (!assigneeUser) {
      return res.status(404).json({
        error: true,
        message: 'Assignee user not found.',
      })
    }

    if (isEvaluator) {
      if (!isSubEvaluatorRole(assigneeUser.role)) {
        return res.status(403).json({
          error: true,
          message: 'You can only assign assets to Sub-Evaluators.',
        })
      }
      if (!isParentEvaluatorOf(requester, assigneeUser)) {
        return res.status(403).json({
          error: true,
          message:
            'Forbidden — you can only assign assets to your own Sub-Evaluators.',
        })
      }
    }

    const Asset = await Model.findByIdAndUpdate(
      assetMongoId,
      {
        evaluator: assigneeUser._id,
        evaluatorUUID: assigneeUser.uuid,
      },
      { new: true },
    )
    if (!Asset) {
      return res.status(400).json({
        error: true,
        message: `Failed to update or asset with this ID not found.`,
      })
    }

    try {
      const NotificationData = {
        userId: assigneeUser._id,
        userUUID: assigneeUser?.uuid,
        UserRole: 'SubEvaluator',
        title: 'Evaluation',
        message: `A new asset assigned for evaluation.`,
        RelateRoute: 'evaluation',
        RelatedId: assetMongoId,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({
      payload: Asset,
      message: 'Evaluator assigned successfully',
    })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

export { AssignAssetToEvaluator }
