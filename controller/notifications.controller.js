import Notifications from '../models/notificationsModel.js'
import { getIO } from '../utils/socket.js'

// Create a new Notification
const createNotification = async ({ data }) => {
  try {
    const { UserRole, title } = data

    if (!UserRole)
      return res
        .status(400)
        .json({ error: true, message: 'User role is required!' })
    if (!title)
      return res
        .status(400)
        .json({ error: true, message: 'Title is required!' })

    const Notify = new Notifications(data)
    await Notify.save()

    // Emit socket event for new notification
    const io = getIO()
    if (io && Notify.userUUID) {
      // Prepare notification payload (excluding MongoDB _id and internal fields)
      const notificationPayload = {
        type: 'notification:new',
        data: {
          uuid: Notify.uuid,
          userUUID: Notify.userUUID,
          userId: Notify.userId || null,
          UserRole: Notify.UserRole,
          title: Notify.title,
          message: Notify.message || null,
          isRead: Notify.isRead || false,
          RelateRoute: Notify.RelateRoute || null,
          RelatedId: Notify.RelatedId || null,
          RelatedUUID: Notify.RelatedUUID || null,
          isDeleted: Notify.isDeleted || false,
          deletedAt: Notify.deletedAt || null,
          createdAt: Notify.createdAt,
          updatedAt: Notify.updatedAt,
        },
      }

      // Emit to user's room (named after their UUID)
      io.to(Notify.userUUID).emit('notification:new', notificationPayload)
      console.log(`Emitted notification:new to room ${Notify.userUUID}`)
    }

    return { success: true, notification: Notify }
  } catch (error) {
    console.log(error, 'error')

    throw { error: true, message: 'Internal server error!' }
  }
}

// Get all Notification
const GetAllNotificationByUserId = async ({ role, userId, limit, page }) => {
  try {
    const perPage = parseInt(limit) || 20
    const currentPage = parseInt(page) || 1
    const skip = (currentPage - 1) * perPage

    const findClause = { userId }

    if (role) findClause.role = role
    findClause.isDeleted = false
    const Notify = await Notifications.find(findClause)
      .select('-_id -userId -RelatedId -createdAt -updatedAt')
      .skip(skip)
      .limit(perPage)
      .sort({ createdAt: -1 })

    return {
      success: true,
      notifications: Notify,
      page: currentPage,
      limit: perPage,
    }
  } catch (error) {
    console.error('Error fetching notifications by userId:', error)
    throw { error: true, message: 'Internal server error!' }
  }
}

// Get all Notification by user role
const GetAllNotificationByUserRole = async ({
  userId,
  UserRole,
  limit,
  page,
}) => {
  try {
    const perPage = parseInt(limit) || 20
    const currentPage = parseInt(page) || 1
    const skip = (currentPage - 1) * perPage

    const findClause = {
      isDeleted: false,
    }

    // Non-admin users → filter by role
    if (UserRole !== 'Admin') {
      findClause.UserRole = UserRole
    }

    // Certain roles → filter by userId
    if (
      userId &&
      (UserRole === 'AssetHolder' || UserRole === 'DealHunter')
    ) {
      findClause.userId = userId
    }

    const notifications = await Notifications.find(findClause)
      // .select('-_id') // keep timestamps for UI
      .skip(skip)
      .limit(perPage)
      .sort({ createdAt: -1 })

    return {
      success: true,
      notifications,
      page: currentPage,
      limit: perPage,
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
    throw { error: true, message: 'Internal server error!' }
  }
}

// Get a Notification by ID
const GetNotificationById = async (id) => {
  try {
    const notification = await Notifications.findById(id, {
      isDeleted: false,
    }).select('-_id -userId -RelatedId -createdAt -updatedAt')
    if (!notification) {
      return res
        .status(404)
        .json({ error: true, message: 'notification not found!' })
    }
    return { success: true, notification }
  } catch (error) {
    throw { error: true, message: 'Internal server error!' }
  }
}

// Update a Notification by ID and mark it as read
const UpdateNotificationAsRead = async (id) => {
  try {
    let Notify = await Notifications.findOneAndUpdate(
      { uuid: id }, // filter
      { isRead: true }, // update
      { new: true } // return updated doc
    )

    if (!Notify) {
      Notify = await Notifications.findOneAndUpdate(
        { _id: id },
        { isRead: true },
        { new: true }
      )
    }
    if (!Notify) {
      throw { error: true, message: 'Notification not found!' }
    }

    // Emit socket event for read notification
    const io = getIO()
    if (io && Notify.userUUID) {
      io.to(Notify.userUUID).emit('notification:read', {
        type: 'notification:read',
        data: {
          _id: Notify._id,
          uuid: Notify.uuid,
          isRead: true,
        },
      })
      console.log(`Emitted notification:read for ${Notify.uuid} to room ${Notify.userUUID}`)
    }

    return {
      success: true,
      message: 'Notification is marked as read!',
      link: GetRoutesForNotifications(Notify),
      data: Notify,
    }
  } catch (error) {
    console.error('Error updating notification:', error)
    throw { error: true, message: 'Internal server error!' }
  }
}

// Delete a Notification by ID
// const DeleteNotificationById = async (id) => {
//   try {
//     const Notify = await Notifications.findByIdAndDelete(id)
//     if (!Notify) throw { error: true, message: 'Notification not found!' }

//     return { success: true, message: 'Notification deleted successfully!' }
//   } catch (error) {
//     throw { error: true, message: 'Internal server error!' }
//   }
// }
const DeleteNotificationById = async (id) => {
  try {
    const notify = await Notifications.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true } },
      { new: true }
    )

    if (!notify) {
      throw { error: true, message: 'Notification not found!' }
    }

    return { success: true, message: 'Notification soft deleted successfully!' }
  } catch (error) {
    throw { error: true, message: 'Internal server error!' }
  }
}

export const GetRoutesForNotifications = (notification) => {
  try {
    if (notification?.RelateRoute === 'advertisement') {
      return `/advertise-with-us`
    }
    if (
      notification?.RelateRoute === 'evaluation' &&
      notification?.UserRole === 'Evaluator'
    ) {
      return `/evaluator-profile`
    }
    if (
      notification?.RelateRoute === 'Trustee' &&
      notification?.UserRole === 'Trustee'
    ) {
      return `/trustee`
    }
    if (
      notification?.RelateRoute === 'TechnicalReport' &&
      notification?.UserRole === 'TechnicalReport'
    ) {
      return `/survey-dashboard`
    }
    if (
      notification?.RelateRoute === 'advertisement' &&
      notification?.UserRole === 'Admin'
    ) {
      if (notification?.RelateId) {
        return `/dashboard/advertisement-approvals/${notification?.RelateId}`
      } else {
        return `/dashboard/advertisement-approvals`
      }
    }
    if (
      notification?.RelateRoute === '3dWalkthrough' &&
      notification?.UserRole === '3dWalkthrough'
    ) {
      return `/3d-walkthrough`
    }
    if (
      notification?.RelateRoute === 'testimonial' &&
      notification?.UserRole === 'Admin'
    ) {
      return `#`
    }

    if (notification?.RelateRoute === 'profile') {
      switch (notification?.UserRole) {
        case 'AssetHolder':
          return `/seller-profile`
        case 'DealHunter':
          return `/profile`
        case 'AssetHolder':
          return `/seller-profile`
        case 'Trustee':
          return `/trustee`
        case 'Evaluator':
          return `/evaluator-profile`
        case 'SubEvaluator':
          return `/sub-evaluator-profile`
        case '3dWalkthrough':
          return `/3d-walkthrough`
        case 'TechnicalReport':
          return `/survey-dashboard`
        default:
          return `#`
      }
    }
    if (
      ['cars', 'boat', 'property', 'jewelry']?.includes(
        notification?.RelateRoute
      ) &&
      notification?.RelatedId &&
      notification?.UserRole === 'AssetHolder'
    ) {
      return `/${notification?.RelateRoute}/${notification?.RelatedId}`
    } else if (notification?.UserRole == 'Evaluator') {
      return `/evaluator-profile/${notification?.RelateRoute}-evaluation`
    }
    return '#'
  } catch (error) {
    return '#'
  }
}

export {
  createNotification,
  GetAllNotificationByUserId,
  GetNotificationById,
  UpdateNotificationAsRead,
  DeleteNotificationById,
  GetAllNotificationByUserRole,
}
