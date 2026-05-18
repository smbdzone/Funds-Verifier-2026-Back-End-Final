import User from '../models/userModel.js'
import asyncHandler from 'express-async-handler'
import jwt from 'jsonwebtoken'
import { logSuspiciousActivity } from './logSuspicious.js'
import SecurityLog from '../models/SecurityLog.js'
import { getClientIP } from '../helper/encryption.js'

const authMiddleware = asyncHandler(async (req, res, next) => {
  try {
    const ip = getClientIP(req)

    // Blocked IP check first
    const record = await SecurityLog.findOne({ ip })
    if (record?.blockedUntil && record.blockedUntil > new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Too many failed attempts. Try again later.',
      })
    }

    const header = req.headers.authorization
    let token = null

    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1]
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken
    }

    if (!token) {
      await logSuspiciousActivity(req, 'Missing or invalid token')
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!process.env.SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Server misconfiguration',
      })
    }

    // Secure JWT verification
    const decoded = jwt.verify(token, process.env.SECRET_KEY, {
      algorithms: ['HS256'],
    })

    if (!decoded.id) {
      throw new Error('Invalid token claims')
    }

    const user = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('_id uuid role email')

    if (!user) {
      await logSuspiciousActivity(req, 'Token user does not exist')
      return res.status(401).json({ success: false, message: 'Invalid token' })
    }

    req.user = user
    next()
  } catch (err) {
    console.error('Auth security error:', err.message)

    await logSuspiciousActivity(req, `Auth failure: ${err.message}`)

    const ip = getClientIP(req)
    await SecurityLog.findOneAndUpdate(
      { ip },
      {
        $inc: { attempts: 1 },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    )

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' })
    }

    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }
})

/**
 * Optional authentication middleware
 * Checks token if provided, but doesn't fail if missing/invalid.
 */
const optionalAuthMiddleware = asyncHandler(async (req, res, next) => {
  try {
    const authHeader =
      req.headers['authorization'] || req.headers['Authorization']

    let token = null
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1]
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken
    }

    if (!token) {
      req.user = null
      return next()
    }

    if (!process.env.SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'SECRET_KEY not configured in environment',
      })
    }

    let decoded
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY, {
        algorithms: ['HS256'],
      })
    } catch (err) {
      req.user = null
      return next()
    }

    const user = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('_id uuid role email')

    req.user = user || null
    return next()
  } catch (err) {
    req.user = null
    return next()
  }
})

const isAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const { _id } = req.user

  try {
    const adminUser = await User.findById(_id, { isDeleted: false }).select(
      '_id role email',
    )

    if (!adminUser || adminUser.isDeleted) {
      return res.status(401).json({ message: 'User not found' })
    }

    if (adminUser.role !== 'Admin') {
      return res.status(400).json({ message: 'You are not an administrator' })
    }

    next()
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

export { authMiddleware, isAdmin, optionalAuthMiddleware }
