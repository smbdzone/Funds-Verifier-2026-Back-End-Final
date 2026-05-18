import User from '../models/userModel.js'
import { checkPermission } from '../utils/checkPermission.js'

export const authorize = (permissionName) => {
  return async (req, res, next) => {
    try {
      const { uuid } = req.user

      let target = await User.findOne({
        uuid: uuid,
        // isDeleted: false,
      }).select('_id role parentEvaluator')

      if (!target) {
        target = await User.findOne({ _id: uuid })
      }
      if (!target) {
        return res.status(404).json({ message: 'User not found' })
      }

      // Admin always allowed
      if (req.user.role === 'Admin') {
        req.targetUser = target
        return next()
      }

      // Check if this role has this specific permission
      const allowed = checkPermission(req.user.role, permissionName)
      if (!allowed) {
        return res.status(403).json({ message: 'Permission denied' })
      }

      // Allow own data even without permission
      if (req.user._id.toString() === target._id.toString()) {
        req.targetUser = target
        return next()
      }

      // Evaluator hierarchy rule (parent Evaluator manages subs)
      if (req.user.role === 'Evaluator') {
        if (
          target.parentEvaluator &&
          target.parentEvaluator.toString() === req.user._id.toString()
        ) {
          req.targetUser = target
          return next()
        }
      }

      return res.status(403).json({ message: 'Forbidden: Access not allowed' })
    } catch (err) {
      console.error('RBAC Error:', err)
      return res.status(500).json({ message: 'Server error' })
    }
  }
}
