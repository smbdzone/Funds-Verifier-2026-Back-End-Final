// middleware/authorizeUser.js
import User from '../models/userModel.js'
import asyncHandler from 'express-async-handler'

/**
 * Confirms the JWT user still exists and is active.
 *
 * Do not load only by `req.user.uuid`: if `uuid` is undefined, Mongoose may omit it
 * from the query and `findOne({ isDeleted: false })` can match another user → false 403.
 */
export const authorizeUserByUUID = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.user._id,
    isDeleted: false,
  })

  if (!user) {
    return res.status(404).json({ message: 'User not found' })
  }

  req.userResource = user
  next()
})
