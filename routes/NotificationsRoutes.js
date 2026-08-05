import express from 'express'
import {
  createNotification,
  ClearAllNotificationsForUser,
  GetAllNotificationByUserId,
  GetAllNotificationByUserRole,
  GetNotificationById,
  MarkAllNotificationsAsRead,
  UpdateNotificationAsRead,
} from '../controller/notifications.controller.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import Notifications from '../models/notificationsModel.js'
import { getIO } from '../utils/socket.js'

const router = express.Router()

function resolveNotificationRole(loggedInUser, requestedRole) {
  const userRole = String(loggedInUser.role || '').trim()
  const isAdmin = userRole === 'Admin'
  let effectiveRole = userRole
  if (loggedInUser.parentEvaluator && userRole === 'Evaluator') {
    effectiveRole = 'SubEvaluator'
  }

  if (!isAdmin) {
    const allowed = new Set([userRole, effectiveRole, 'Sub-Evaluator'])
    if (userRole === 'Evaluator' && loggedInUser.parentEvaluator) {
      allowed.add('SubEvaluator')
    }
    const role = String(requestedRole || effectiveRole || userRole).trim()
    if (requestedRole && !allowed.has(role)) {
      return {
        error: true,
        status: 403,
        message: 'Forbidden: cannot access notifications for this role',
      }
    }
    return { isAdmin, UserRole: role || effectiveRole }
  }

  return {
    isAdmin,
    UserRole: String(requestedRole || 'Admin').trim() || 'Admin',
  }
}

router.post('/', authMiddleware, authorizeUserByUUID, async (req, res) => {
  try {
    const data = req.body
    const notification = await createNotification({ data })
    return res.status(201).json(notification)
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: true,
      message: error?.message || 'Internal server error!',
    })
  }
})

router.get(
  '/user/:userId',
  authMiddleware,
  authorizeUserByUUID,
  async (req, res) => {
    const loggedInUser = req.userResource

    try {
      const limit = req.query.limit
      const userId = loggedInUser.userId
      const page = req.query.page
      const role = loggedInUser.role

      const notification = await GetAllNotificationByUserId({
        role,
        page,
        limit,
        userId,
      })
      return res.status(201).json(notification)
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  },
)

router.get(
  '/role/:role',
  authMiddleware,
  authorizeUserByUUID,
  async (req, res) => {
    try {
      const loggedInUser = req.userResource
      const resolved = resolveNotificationRole(loggedInUser, req.params.role)
      if (resolved.error) {
        return res.status(resolved.status).json({
          success: false,
          message: resolved.message,
        })
      }

      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || 10

      const notifications = await GetAllNotificationByUserRole({
        page,
        limit,
        userUUID: loggedInUser.uuid,
        userMongoId: loggedInUser._id,
        UserRole: resolved.UserRole,
        isAdmin: resolved.isAdmin,
      })

      return res.status(200).json(notifications)
    } catch (error) {
      return res.status(500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  },
)

router.delete(
  '/clear',
  authMiddleware,
  authorizeUserByUUID,
  async (req, res) => {
    try {
      const loggedInUser = req.userResource
      const resolved = resolveNotificationRole(
        loggedInUser,
        req.query.role || req.body?.role,
      )
      if (resolved.error) {
        return res.status(resolved.status).json({
          success: false,
          message: resolved.message,
        })
      }

      const result = await ClearAllNotificationsForUser({
        userUUID: loggedInUser.uuid,
        userMongoId: loggedInUser._id,
        UserRole: resolved.UserRole,
        isAdmin: resolved.isAdmin,
      })

      return res.status(200).json(result)
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  },
)

router.patch(
  '/read-all',
  authMiddleware,
  authorizeUserByUUID,
  async (req, res) => {
    try {
      const loggedInUser = req.userResource
      const resolved = resolveNotificationRole(
        loggedInUser,
        req.query.role || req.body?.role,
      )
      if (resolved.error) {
        return res.status(resolved.status).json({
          success: false,
          message: resolved.message,
        })
      }

      const result = await MarkAllNotificationsAsRead({
        userUUID: loggedInUser.uuid,
        userMongoId: loggedInUser._id,
        UserRole: resolved.UserRole,
        isAdmin: resolved.isAdmin,
      })

      return res.status(200).json(result)
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  },
)

router.get('/:id', authMiddleware, authorizeUserByUUID, async (req, res) => {
  try {
    const loggedInUser = req.userResource
    const notificationId = await Notifications.findOne({
      userId: loggedInUser._id,
      isDeleted: false,
    })
    const notification = await GetNotificationById(notificationId._id)
    return res.status(201).json(notification)
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: true,
      message: error?.message || 'Internal server error!',
    })
  }
})

router.patch(
  '/:id/read',
  authMiddleware,
  authorizeUserByUUID,
  async (req, res) => {
    try {
      const id = req.params.id
      const notification = await UpdateNotificationAsRead(id)
      return res.status(201).json(notification)
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  },
)

router.delete('/:id', authMiddleware, authorizeUserByUUID, async (req, res) => {
  try {
    const loggedInUser = req.userResource
    const { id } = req.params

    const notification = await Notifications.findOne({
      uuid: id,
    })

    if (!notification || notification.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Notification not found or already deleted' })
    }

    const ownsNotification =
      notification.userUUID === loggedInUser.uuid ||
      String(notification.userId) === String(loggedInUser._id) ||
      String(notification.userId) === loggedInUser.uuid

    if (loggedInUser.role !== 'Admin' && !ownsNotification) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: cannot delete this notification',
      })
    }

    const userUUID = notification.userUUID

    notification.isDeleted = true
    notification.deletedAt = new Date()
    await notification.save()

    const io = getIO()
    if (io && userUUID) {
      io.to(userUUID).emit('notification:deleted', {
        type: 'notification:deleted',
        data: { uuid: notification.uuid },
      })
    }

    return res
      .status(200)
      .json({ message: 'Notification soft-deleted successfully' })
  } catch (error) {
    return res.status(error?.status || 500).json({
      error: true,
      message: error?.message || 'Internal server error!',
    })
  }
})

export default router
