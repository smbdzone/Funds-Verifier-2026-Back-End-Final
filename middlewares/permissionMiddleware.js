import roles from '../constants/permissions.js'

export const permission = (action) => {
  return (req, res, next) => {
    try {
      const userRole = req.user?.role

      if (!userRole) {
        return res.status(401).json({ message: 'Unauthorized: No role found' })
      }

      const rolePermissions = roles[userRole]

      if (!rolePermissions) {
        return res.status(403).json({ message: 'Forbidden: Invalid role' })
      }

      if (!rolePermissions[action]) {
        return res
          .status(403)
          .json({ message: `Forbidden: No ${action} access` })
      }

      next()
    } catch (err) {
      console.error('Permission middleware error:', err)
      res.status(500).json({ message: 'Server Error in permission middleware' })
    }
  }
}
