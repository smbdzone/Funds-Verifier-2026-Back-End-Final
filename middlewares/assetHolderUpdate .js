import jwt from 'jsonwebtoken'
import User from '../models/userModel.js'
// import roles from '../constants/moduleCreatePermissions.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import { logSuspiciousActivity } from './logSuspicious.js'

const assetModels = {
  Property,
  Car,
  Boat,
  Jewelry,
}

export const assetHolderUpdate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await logSuspiciousActivity(req, 'Missing or invalid token')
      return res.status(401).json({ message: 'Unauthorized: Missing token' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.SECRET_KEY)
    const user = await User.findById(decoded.id, { isDeleted: false })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const { moduleId } = req.params
    if (!moduleId) {
      return res.status(400).json({ message: 'moduleId required' })
    }

    let assetFound = null

    for (const key in assetModels) {
      const Model = assetModels[key]
      const record = await Model.findOne({ uuid: moduleId, isDeleted: false })

      if (record) {
        assetFound = { record, model: key }
        break
      }
    }

    if (!assetFound || !assetFound.record) {
      return res.status(404).json({ message: 'Asset not found' })
    }

    const asset = assetFound.record

    // ADMIN CAN UPDATE ANYTHING
    if (user.role === 'Admin') {
      req.user = user
      req.asset = asset
      return next()
    }

    // OWNER CAN UPDATE
    if (asset.userUUID === user.uuid) {
      req.user = user
      req.asset = asset
      return next()
    }

    const isEvaluator = user.role === 'Evaluator'
    const isSubEvaluator = ['Sub-Evaluator', 'SubEvaluator'].includes(user.role)

    const userIdString = String(user._id)
    const isDirectAssignee =
      asset.evaluatorUUID === user.uuid ||
      (asset.evaluator && String(asset.evaluator) === userIdString)

    if ((isEvaluator || isSubEvaluator) && isDirectAssignee) {
      req.user = user
      req.asset = asset
      return next()
    }

    // Parent evaluator can update assets assigned to their own sub-evaluator.
    if (isEvaluator && (asset.evaluatorUUID || asset.evaluator)) {
      let assignedEvaluatorUser = null
      if (asset.evaluatorUUID) {
        assignedEvaluatorUser = await User.findOne(
          { uuid: asset.evaluatorUUID, isDeleted: false },
          { role: 1, parentEvaluator: 1, uuid: 1 },
        )
      }
      if (!assignedEvaluatorUser && asset.evaluator) {
        assignedEvaluatorUser = await User.findOne(
          { _id: asset.evaluator, isDeleted: false },
          { role: 1, parentEvaluator: 1, uuid: 1 },
        )
      }

      const assignedIsSubEvaluator = ['Sub-Evaluator', 'SubEvaluator'].includes(
        assignedEvaluatorUser?.role,
      )
      const parentEvaluatorRef = assignedEvaluatorUser?.parentEvaluator
      const isParentOfAssignedSub =
        assignedIsSubEvaluator &&
        parentEvaluatorRef &&
        [user.uuid, userIdString].includes(String(parentEvaluatorRef))

      if (isParentOfAssignedSub) {
        req.user = user
        req.asset = asset
        return next()
      }
    }

    return res.status(403).json({
      message: 'Forbidden: You are not authorized to update this asset',
    })
  } catch (err) {
    console.error('Asset Holder Update Middleware Error:', err)
    return res.status(500).json({
      message: 'Server error in assetHolderUpdate',
      error: err.message,
    })
  }
}
