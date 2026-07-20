import Notifications from '../models/notificationsModel.js'
import { getIO } from '../utils/socket.js'

// Create a new Notification
const createNotification = async ({ data }) => {
  try {
    const { UserRole, title } = data || {}

    if (!UserRole) {
      throw new Error('User role is required!')
    }
    if (!title) {
      throw new Error('Title is required!')
    }

    const Notify = new Notifications(data)
    await Notify.save()

    // Emit socket event for new notification
    const io = getIO()
    if (io) {
      const notificationPayload = {
        type: 'notification:new',
        data: {
          uuid: Notify.uuid,
          userUUID: Notify.userUUID || null,
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

      if (Notify.userUUID) {
        io.to(Notify.userUUID).emit('notification:new', notificationPayload)
        console.log(`Emitted notification:new to room ${Notify.userUUID}`)
      } else if (Notify.UserRole) {
        io.to(`role:${Notify.UserRole}`).emit('notification:new', notificationPayload)
        console.log(`Emitted notification:new to role:${Notify.UserRole}`)
      }
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
      .select('-_id -userId -RelatedId')
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

// Roles that receive personal notifications (scoped to one user)
const PERSONAL_NOTIFICATION_ROLES = new Set([
  'AssetHolder',
  'DealHunter',
  'Evaluator',
  'SubEvaluator',
  'Sub-Evaluator',
  'Trustee',
  'TechnicalReport',
  '3dWalkthrough',
])

const BROADCAST_USER_UUID_CLAUSE = [
  { userUUID: null },
  { userUUID: { $exists: false } },
  { userUUID: '' },
]

function buildOwnerMatchClause(userUUID, userMongoId) {
  const ownerMatch = [{ userUUID }, { userId: userUUID }]
  if (userMongoId) {
    ownerMatch.push({ userId: String(userMongoId) })
  }
  return ownerMatch
}

function buildUserNotificationFilter({
  userUUID,
  userMongoId,
  UserRole,
  isAdmin = false,
}) {
  if (isAdmin) {
    return { isDeleted: false, UserRole }
  }

  if (!userUUID || !PERSONAL_NOTIFICATION_ROLES.has(UserRole)) {
    return { isDeleted: false, UserRole }
  }

  const ownerMatch = buildOwnerMatchClause(userUUID, userMongoId)
  const orClauses = [
    {
      UserRole,
      $or: [...ownerMatch, ...BROADCAST_USER_UUID_CLAUSE],
    },
  ]

  if (UserRole === 'SubEvaluator' || UserRole === 'Sub-Evaluator') {
    orClauses.push({
      UserRole: 'Evaluator',
      $or: BROADCAST_USER_UUID_CLAUSE,
    })
  }

  return {
    isDeleted: false,
    $or: orClauses,
  }
}

// Get all Notification by user role
const GetAllNotificationByUserRole = async ({
  userUUID,
  userMongoId,
  UserRole,
  limit,
  page,
  isAdmin = false,
}) => {
  try {
    const perPage = parseInt(limit) || 20
    const currentPage = parseInt(page) || 1
    const skip = (currentPage - 1) * perPage

    const findClause = buildUserNotificationFilter({
      userUUID,
      userMongoId,
      UserRole,
      isAdmin,
    })

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
    }).select('-_id -userId -RelatedId')
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
    const role = notification?.UserRole
    const route = notification?.RelateRoute

    if (route === 'advertisement') {
      return `/advertise-with-us`
    }
    if (route === 'documents-storage' && role === 'AssetHolder') {
      return '/seller-profile/documents-storage'
    }
    if (route === 'pending-evaluation' && role === 'AssetHolder') {
      if (notification?.RelatedUUID) {
        return `/seller-profile/pending-evaluation/${notification.RelatedUUID}`
      }
      return '/seller-profile/pending-evaluation'
    }
    if (route === 'my-listing' && role === 'AssetHolder') {
      return '/seller-profile/my-listing'
    }
    if (
      (route === 'all-slot' || route === 'create-slot') &&
      role === 'AssetHolder'
    ) {
      return '/seller-profile/all-slot'
    }
    if (route === 'evaluation' && role === 'Evaluator') {
      return '/evaluator-profile/property-evaluation'
    }
    if (route === 'Trustee' && role === 'Trustee') {
      return `/trustee`
    }
    if (route === 'TechnicalReport' && role === 'TechnicalReport') {
      return `/survey-dashboard`
    }
    if (route === 'advertisement' && role === 'Admin') {
      if (notification?.RelateId) {
        return `/dashboard/advertisement-approvals/${notification?.RelateId}`
      }
      return `/dashboard/advertisement-approvals`
    }
    if (route === '3dWalkthrough' && role === '3dWalkthrough') {
      return `/3d-walkthrough`
    }
    if (route === 'testimonial' && role === 'Admin') {
      return `#`
    }

    if (route === 'profile') {
      switch (role) {
        case 'AssetHolder':
          return `/seller-profile`
        case 'DealHunter':
          return `/profile`
        case 'Trustee':
          return `/trustee`
        case 'Evaluator':
          return `/evaluator-profile`
        case 'SubEvaluator':
        case 'Sub-Evaluator':
          return `/sub-evaluator-profile`
        case '3dWalkthrough':
          return `/3d-walkthrough`
        case 'TechnicalReport':
          return `/survey-dashboard`
        default:
          return `#`
      }
    }

    const evaluatorRoutes = {
      property: '/evaluator-profile/property-evaluation',
      cars: '/evaluator-profile/cars-evaluation',
      car: '/evaluator-profile/cars-evaluation',
      boat: '/evaluator-profile/boat-evaluation',
      jewellery: '/evaluator-profile/jewellery-evaluation',
      jewelry: '/evaluator-profile/jewellery-evaluation',
      evaluation: '/evaluator-profile/property-evaluation',
    }

    if (role === 'Evaluator' || role === 'SubEvaluator' || role === 'Sub-Evaluator') {
      if (evaluatorRoutes[route]) {
        return evaluatorRoutes[route]
      }
      if (route) {
        return `/evaluator-profile/${route}-evaluation`
      }
    }

    if (
      ['cars', 'boat', 'property', 'jewelry', 'jewellery']?.includes(route) &&
      notification?.RelatedId &&
      role === 'AssetHolder'
    ) {
      return `/${route}/${notification.RelatedId}`
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
