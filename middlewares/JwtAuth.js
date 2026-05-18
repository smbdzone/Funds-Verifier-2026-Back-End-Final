import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()

export const JwtAuthMiddleWare = (req, res, next) => {
  const header = req.headers['authorization']
  const token = header && header.split(' ')[1]
  try {
    if (!process.env.SECRET_KEY) {
      throw {
        status: 500,
        message: 'SECRET_KEY not configured',
      }
    }
    if (!token) {
      throw {
        status: 403,
        message: 'User not authorized',
      }
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          throw { status: 401, message: 'Token expired' }
        } else if (err.name === 'JsonWebTokenError') {
          throw { status: 403, message: 'Invalid token' }
        } else {
          throw { status: 403, message: 'Token verification failed' }
        }
      }
      req.user = user
      next()
    })
  } catch (error) {
    console.error(error)
    next(error)
  }
}

export const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY)
    return decoded?.id || decoded
  } catch (error) {
    return null
  }
}
