import Car from '../models/carModel.js'
import validateMongoId from '../utils/validateMongodbId.js'
import asyncHandler from 'express-async-handler'
import { createNotification } from './notifications.controller.js'
import Boat from '../models/boatModel.js'
import Property from '../models/propertyModel.js'
import Jewelry from '../models/jewelryModel.js'
import User from '../models/userModel.js'

const AssignAssetToEvaluator = asyncHandler(async (req, res) => {
  try {
    const userId = req.query.userId
    const { assetId, assetType, assigneeId } = req.body

    if (!userId) {
      return res
        .status(400)
        .json({ error: true, message: `userId is required.` })
    }

    if (
      !assetType ||
      !['boat', 'car', 'property', 'jewelry']?.includes(assetType)
    ) {
      return res.status(400).json({
        error: true,
        message: `Asset type is required and must be a boat, car, property and jewelry.`,
      })
    }
    if (!assigneeId) {
      return res.status(400).json({
        error: true,
        message: `Evaluator id as assigneeId is required.`,
      })
    }
    if (!assetId) {
      return res
        .status(400)
        .json({ error: true, message: `Asset ID is required.` })
    }

    validateMongoId(userId, 'user')
    validateMongoId(assigneeId, 'evaluator')
    validateMongoId(assetId, 'asset')

    const assigneeUser = await User.findById(assigneeId).select('uuid')
    if (!assigneeUser) {
      return res.status(404).json({
        error: true,
        message: 'Assignee user not found.',
      })
    }

    const AssignAssettoEvaluator = async (Model) => {
      const Asset = await Model.findByIdAndUpdate(
        assetId,
        {
          evaluator: assigneeId,
          evaluatorUUID: assigneeUser.uuid,
        },
        { new: true }
      )
      if (!Asset)
        return res.status(400).json({
          error: true,
          message: `Failed to update or asset with this ID not found.`,
        })
      return Asset
    }
    let ResponseData

    switch (assetType) {
      case 'car':
        ResponseData = await AssignAssettoEvaluator(Car)
        break
      case 'boat':
        ResponseData = await AssignAssettoEvaluator(Boat)
        break
      case 'property':
        ResponseData = await AssignAssettoEvaluator(Property)
        break
      case 'jewelry':
        ResponseData = await AssignAssettoEvaluator(Jewelry)
        break
      default:
        return res
          .status(400)
          .json({ error: true, message: `Invalid asset type provided.` })
    }
    try {
      const NotificationData = {
        userId: assigneeId,
        userUUID: assigneeUser?.uuid,
        UserRole: 'SubEvaluator',
        title: 'Evaluation',
        message: `A new asset assigned for evaluation.`,
        RelateRoute: 'evaluation',
        RelatedId: assetId,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({ payload: ResponseData })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

export { AssignAssetToEvaluator }
