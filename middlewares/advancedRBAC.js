import User from '../models/userModel.js'
import { checkPermission } from '../utils/checkPermission.js'
import { sanitizeUUID, sanitizeMongoId } from '../utils/nosqlSanitizer.js'

const findSubjectUser = async (id) => {
  if (!id) return null

  const sanitizedUuid = sanitizeUUID(id)
  if (sanitizedUuid) {
    const byUuid = await User.findOne({ uuid: sanitizedUuid, isDeleted: false })
      .select('_id role parentEvaluator uuid')
    if (byUuid) return byUuid
  }

  const mongoId = sanitizeMongoId(id)
  if (mongoId) {
    return User.findOne({ _id: mongoId, isDeleted: false }).select(
      '_id role parentEvaluator uuid',
    )
  }

  return null
}

const isParentEvaluatorOf = (requester, subject) => {
  if (!requester?._id || !subject?.parentEvaluator) return false
  const parentRef = String(subject.parentEvaluator)
  return (
    parentRef === String(requester._id) ||
    (requester.uuid && parentRef === String(requester.uuid))
  )
}

const PARENT_MANAGED_PERMISSIONS = [
  'deleteOthersAccount',
  'editOwnProfile',
  'editOthersProfile',
]

export const authorize = (permissionName) => {
  return async (req, res, next) => {
    try {
      const requester = req.user
      if (!requester) {
        return res.status(401).json({ message: 'Unauthorized' })
      }

      if (requester.role === 'Admin') {
        return next()
      }

      const subjectId = req.params?.id
      const subjectUser = subjectId ? await findSubjectUser(subjectId) : null

      if (subjectUser) {
        const isSelf = String(subjectUser._id) === String(requester._id)
        const isParent = isParentEvaluatorOf(requester, subjectUser)

        if (isSelf && checkPermission(requester.role, permissionName)) {
          req.targetUser = subjectUser
          return next()
        }

        if (
          isParent &&
          requester.role === 'Evaluator' &&
          checkPermission(requester.role, 'manageSubEvaluators') &&
          PARENT_MANAGED_PERMISSIONS.includes(permissionName)
        ) {
          req.targetUser = subjectUser
          return next()
        }

        if (checkPermission(requester.role, permissionName)) {
          req.targetUser = subjectUser
          return next()
        }

        return res.status(403).json({ message: 'Permission denied' })
      }

      const allowed = checkPermission(requester.role, permissionName)
      if (!allowed) {
        return res.status(403).json({ message: 'Permission denied' })
      }

      return next()
    } catch (err) {
      console.error('RBAC Error:', err)
      return res.status(500).json({ message: 'Server error' })
    }
  }
}
