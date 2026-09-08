/**
 * Notification Socket Handler
 * Manages Socket.IO connections for real-time notifications
 */

import { getIO } from '../utils/socket.js'
import socketAuthMiddleware from '../middlewares/socketAuthMiddleware.js'

// Rate limiting: Track events per user per minute
const eventCounts = new Map() // Map<userUUID, { count: number, resetTime: number }>
const MAX_EVENTS_PER_MINUTE = 30

/**
 * Check if user has exceeded rate limit
 * @param {string} userUUID - User UUID
 * @returns {boolean} - True if rate limit exceeded
 */
const checkRateLimit = (userUUID) => {
  const now = Date.now()
  const userLimit = eventCounts.get(userUUID)

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize
    eventCounts.set(userUUID, { count: 1, resetTime: now + 60000 }) // 1 minute
    return false
  }

  if (userLimit.count >= MAX_EVENTS_PER_MINUTE) {
    return true // Rate limit exceeded
  }

  userLimit.count++
  return false
}

/**
 * Initialize notification socket handlers
 */
export const initNotificationSocket = () => {
  const io = getIO()

  if (!io) {
    console.error('Socket.IO not initialized. Cannot set up notification socket.')
    return
  }

  // Apply authentication middleware to all connections
  io.use(socketAuthMiddleware)

  // Handle socket connections
  io.on('connection', (socket) => {
    const userUUID = socket.userUUID
    const userId = socket.userId
    const userRole = socket.userRole

    console.log(
      `Socket connected: User ${userUUID} (ID: ${userId}, Role: ${userRole})`
    )

    // Join user to their room (named after their UUID)
    socket.join(userUUID)
    if (userRole) {
      socket.join(`role:${userRole}`)
      if (userRole === 'Evaluator' || userRole === 'Sub-Evaluator' || userRole === 'SubEvaluator') {
        socket.join('role:Evaluator')
      }
    }
    console.log(`User ${userUUID} joined room: ${userUUID}`)

    // Emit connection success event to client
    socket.emit('connection:success', {
      message: 'Connected to notification server',
      userUUID,
      userId,
      userRole,
    })

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(
        `Socket disconnected: User ${userUUID} (Reason: ${reason})`
      )
      // Clean up rate limit tracking on disconnect (optional)
      // eventCounts.delete(userUUID) // Uncomment if you want to clear on disconnect
    })

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${userUUID}:`, error)
    })

    // Handle notification:markRead event (for Phase 5)
    socket.on('notification:markRead', async (data, callback) => {
      try {
        // Rate limiting check
        if (checkRateLimit(userUUID)) {
          console.warn(`Rate limit exceeded for user ${userUUID}`)
          return callback({
            success: false,
            message: 'Rate limit exceeded. Please try again later.',
          })
        }

        const { uuid } = data
        if (!uuid) {
          return callback({ success: false, message: 'Notification UUID required' })
        }

        // Import here to avoid circular dependency
        const { UpdateNotificationAsRead } = await import(
          '../controller/notifications.controller.js'
        )

        const result = await UpdateNotificationAsRead(uuid)

        if (result.success) {
          // The UpdateNotificationAsRead function will emit the event via socket
          callback({ success: true, message: 'Notification marked as read' })
        } else {
          callback({ success: false, message: 'Failed to mark notification as read' })
        }
      } catch (error) {
        console.error('Error marking notification as read:', error)
        callback({ success: false, message: error.message || 'Internal server error' })
      }
    })

    // Handle notification:delete event (for Phase 5)
    socket.on('notification:delete', async (data, callback) => {
      try {
        // Rate limiting check
        if (checkRateLimit(userUUID)) {
          console.warn(`Rate limit exceeded for user ${userUUID}`)
          return callback({
            success: false,
            message: 'Rate limit exceeded. Please try again later.',
          })
        }

        const { uuid } = data
        if (!uuid) {
          return callback({ success: false, message: 'Notification UUID required' })
        }

        // Import here to avoid circular dependency
        const Notifications = (await import('../models/notificationsModel.js')).default

        // Find notification and verify ownership
        const notification = await Notifications.findOne({
          uuid,
          userUUID: socket.userUUID,
          isDeleted: false,
        })

        if (!notification) {
          return callback({
            success: false,
            message: 'Notification not found or unauthorized',
          })
        }

        // Soft delete
        notification.isDeleted = true
        notification.deletedAt = new Date()
        await notification.save()

        // Emit delete event to user's room
        const io = getIO()
        if (io) {
          io.to(socket.userUUID).emit('notification:deleted', {
            type: 'notification:deleted',
            data: { uuid: notification.uuid },
          })
        }

        callback({ success: true, message: 'Notification deleted successfully' })
      } catch (error) {
        console.error('Error deleting notification:', error)
        callback({ success: false, message: error.message || 'Internal server error' })
      }
    })
  })

  console.log('Notification socket handlers initialized')
}

export default initNotificationSocket

