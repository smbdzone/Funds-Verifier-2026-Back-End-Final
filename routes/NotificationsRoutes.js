import express from 'express'
import {
  createNotification,
  DeleteNotificationById,
  GetAllNotificationByUserId,
  GetAllNotificationByUserRole,
  GetNotificationById,
  UpdateNotificationAsRead,
} from '../controller/notifications.controller.js'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import Notifications from '../models/notificationsModel.js'
import { getIO } from '../utils/socket.js'

const router = express.Router()

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
    const loggedInUser = req.userResource // 📌 From auth middleware

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
  }
)

router.get(
  '/role/:role',
  authMiddleware,
  isAdmin,
  authorizeUserByUUID,
  async (req, res) => {
    try {
      const loggedInUser = req.userResource

      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || 10

      const payload = {
        page,
        limit,
      }

      // Admin → all notifications
      if (loggedInUser.role === 'Admin') {
        const notifications = await GetAllNotificationByUserRole({
          ...payload, userId: loggedInUser.uuid,
          UserRole: loggedInUser.role,
        })

        return res.status(200).json(notifications)
      }

      // Non-admin → user-specific
      const notifications = await GetAllNotificationByUserRole({
        ...payload,
        userId: loggedInUser.uuid,
        UserRole: loggedInUser.role,
      })

      return res.status(200).json(notifications)
    } catch (error) {
      return res.status(500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  }
)


router.get('/:id', authMiddleware, authorizeUserByUUID, async (req, res) => {
  try {
    const loggedInUser = req.userResource // 📌 From auth middleware
    const notificationId = await Notifications.findOne({
      userId: loggedInUser._id,
      isDeleted: false,
    })
    const id = req.params.id
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
      const loggedInUser = req.userResource // 📌 From auth middleware
      const notificationId = await Notifications.findOne({
        userId: loggedInUser._id,
        userUUID: loggedInUser.uuid,
        isDeleted: false,
      })

      const id = req.params.id

      const notification = await UpdateNotificationAsRead(id)
      return res.status(201).json(notification)
    } catch (error) {
      return res.status(error?.status || 500).json({
        error: true,
        message: error?.message || 'Internal server error!',
      })
    }
  }
)

router.delete('/:id', authMiddleware, authorizeUserByUUID, async (req, res) => {
  try {
    const loggedInUser = req.userResource // From auth middleware
    const { id } = req.params // This is the notification UUID (not MongoDB _id)

    // Find notification by UUID before deletion
    const notification = await Notifications.findOne({
      uuid: id,
      // userUUID: loggedInUser.uuid,
      // isDeleted: false,
    })

    if (!notification || notification.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Notification not found or already deleted' })
    }

    // Get the notification's userUUID before soft-deleting
    const userUUID = notification.userUUID

    // Soft delete
    notification.isDeleted = true
    notification.deletedAt = new Date()
    await notification.save()

    // Emit socket event for deleted notification
    const io = getIO()
    if (io && userUUID) {
      io.to(userUUID).emit('notification:deleted', {
        type: 'notification:deleted',
        data: { uuid: notification.uuid },
      })
      console.log(`Emitted notification:deleted for ${notification.uuid} to room ${userUUID}`)
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
