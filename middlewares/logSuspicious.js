import SecurityLog from '../models/SecurityLog.js'

export const logSuspiciousActivity = async (req, reason, userId = null) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress

  await SecurityLog.findOneAndUpdate(
    {
      ip,
      endpoint: req.originalUrl,
    },
    {
      $setOnInsert: { ip, endpoint: req.originalUrl },
      $inc: { attempts: 1 },
      reason,
      userId,
    },
    { upsert: true, new: true }
  )
}
