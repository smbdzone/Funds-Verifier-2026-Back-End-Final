import SecurityLog from '../models/SecurityLog.js'

export const autoBlockMiddleware = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

  const record = await SecurityLog.findOne({ ip })

  // If blocked
  if (record?.blockedUntil && record.blockedUntil > new Date()) {
    return res.status(403).json({
      success: false,
      message:
        'You are temporarily blocked due to repeated suspicious activity.',
    })
  }

  next()
}
