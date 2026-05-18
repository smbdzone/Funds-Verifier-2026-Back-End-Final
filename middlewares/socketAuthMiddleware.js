/**
 * Socket.IO Authentication Middleware
 * Verifies JWT token from socket handshake and attaches user data
 */

import jwt from 'jsonwebtoken'
import User from '../models/userModel.js'
import DealHunter from '../models/dealHunterModel.js'

/**
 * Socket authentication middleware
 * Extracts and verifies JWT token from socket handshake
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Function} next - Next middleware function
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    // Extract token from handshake auth or query params
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token) {
      console.log('Socket connection rejected: No token provided')
      return next(new Error('Authentication error: No token provided'))
    }

    // Verify JWT token
    let decoded
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY)
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        console.log('Socket connection rejected: Token expired')
        return next(new Error('Authentication error: Token expired'))
      }
      console.log('Socket connection rejected: Invalid token')
      return next(new Error('Authentication error: Invalid token'))
    }

    // Fetch user from database
    let user = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('_id uuid role')

    // If not found in User model, try DealHunter model
    // Note: DealHunter doesn't have a 'role' field, so we'll set it to 'DealHunter'
    if (!user) {
      const dealHunter = await DealHunter.findOne({
        _id: decoded.id,
        isDeleted: false,
      }).select('_id uuid')
      
      if (dealHunter) {
        // DealHunter users don't have a role field, so we'll set a default
        user = {
          _id: dealHunter._id,
          uuid: dealHunter.uuid,
          role: 'DealHunter', // Default role for DealHunter users
        }
      }
    }

    if (!user) {
      console.log('Socket connection rejected: User not found')
      return next(new Error('Authentication error: User not found'))
    }

    // Attach user data to socket
    socket.userId = user._id.toString()
    socket.userUUID = user.uuid
    socket.userRole = user.role || null

    console.log(
      `Socket authenticated: User ${socket.userUUID} (${socket.userRole})`
    )

    next()
  } catch (error) {
    console.error('Socket authentication error:', error.message)
    next(new Error('Authentication error: ' + error.message))
  }
}

export default socketAuthMiddleware

