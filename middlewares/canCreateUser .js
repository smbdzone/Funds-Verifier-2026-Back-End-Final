import asyncHandler from 'express-async-handler'
import jwt from 'jsonwebtoken'
import User from '../models/userModel.js'

// Middleware to check creation permissions
const canCreateUser = asyncHandler(async (req, res, next) => {
  try {
    // 1️⃣ Get token from headers
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }
    const token = authHeader.split(' ')[1]

    // 2️⃣ Verify token and get user ID
    const decoded = jwt.verify(token, process.env.SECRET_KEY)
    const currentUserId = decoded.id
    console.log('before')

    // 3️⃣ Fetch user from DB
    const currentUser = await User.findById(decoded.id)

    if (!currentUser) {
      return res.status(401).json({ success: false, message: 'User not found' })
    }
    console.log({ currentUser })

    const currentUserRole = currentUser.role
    const newUserRole = req.body.role

    // 4️⃣ Admin can create any role
    if (currentUserRole === 'Admin') {
      return next()
    }

    // 5️⃣ ParentEvaluator can only create sub-evaluators
    if (currentUserRole === 'ParentEvaluator') {
      if (newUserRole === 'SubEvaluator') {
        return next()
      } else {
        return res.status(403).json({
          success: false,
          message: 'ParentEvaluator can only create SubEvaluator users',
        })
      }
    }

    // 6️⃣ Other roles cannot create users
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to create users',
    })
  } catch (error) {
    console.error(error)
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }
})

export default canCreateUser
