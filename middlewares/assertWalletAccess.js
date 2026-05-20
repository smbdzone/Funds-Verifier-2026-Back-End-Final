import asyncHandler from 'express-async-handler'

/** Ads wallet: owner or Admin only. */
export const assertWalletAccess = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  if (req.user.role === 'Admin') {
    return next()
  }

  const { id } = req.params
  if (String(id) === String(req.user._id) || String(id) === String(req.user.uuid)) {
    return next()
  }

  return res.status(403).json({
    success: false,
    message: 'Forbidden — you can only access your own wallet',
  })
})
