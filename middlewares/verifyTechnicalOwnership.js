import { logSuspiciousActivity } from './logSuspicious.js'

export const technicalUserOnly = async (req, res, next) => {
  try {
    const user = req.user // comes from authMiddleware
    // console.log({ user })

    if (!user) {
      await logSuspiciousActivity(req, 'Unauthorized: no user in token')
      return res.status(401).json({ message: 'Unauthorized' })
    }

    // Only allow if role is 3DUser
    if (user.role !== 'TechnicalReport') {
      await logSuspiciousActivity(
        req,
        'Unauthorized 3D request access attempt',
        user._id
      )
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only 3D users can access this request',
      })
    }

    next()
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
}
