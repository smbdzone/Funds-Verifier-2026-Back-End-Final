// middleware/auth.js
import jwt from 'jsonwebtoken'

module.exports = function (req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]
  // console.log({ token })

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: token required' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // decoded should include: id, role, email, etc.
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email }
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' })
  }
}
