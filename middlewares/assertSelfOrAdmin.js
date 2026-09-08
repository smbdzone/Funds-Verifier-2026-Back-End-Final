import asyncHandler from 'express-async-handler'

/**
 * Allow Admin or the authenticated user matching :param (Mongo _id or uuid).
 */
export const assertSelfOrAdminParam = (paramName = 'userId') =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (req.user.role === 'Admin') {
      return next()
    }

    const target = req.params[paramName] || req.query[paramName] || req.query.userUUID
    if (!target) {
      return res.status(400).json({
        success: false,
        message: `${paramName} is required`,
      })
    }

    const targetStr = String(target)
    const isSelf =
      targetStr === String(req.user._id) || targetStr === String(req.user.uuid)

    if (!isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden — you can only access your own data',
      })
    }

    next()
  })

/**
 * For request bodies: userId in body must match caller unless Admin.
 */
export const assertSelfOrAdminBody = (fieldName = 'userId') =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (req.user.role === 'Admin') {
      return next()
    }

    const target = req.body?.[fieldName]
    if (!target) {
      return next()
    }

    const targetStr = String(target)
    const isSelf =
      targetStr === String(req.user._id) || targetStr === String(req.user.uuid)

    if (!isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden — you can only access your own data',
      })
    }

    next()
  })
