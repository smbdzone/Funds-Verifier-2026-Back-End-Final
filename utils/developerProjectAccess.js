import DeveloperProject from '../models/developerProjectModel.js'
import User from '../models/userModel.js'
import { sanitizeMongoId } from './nosqlSanitizer.js'

export const assertApprovedDeveloper = async (req, res) => {
  if (!req.user?._id) {
    res.status(401)
    throw new Error('Unauthorized')
  }
  const user = await User.findById(req.user._id)
  if (!user || user.isDeleted || user.role !== 'Developer') {
    res.status(403)
    throw new Error('Only Developer accounts can manage projects')
  }
  if (user.developerKyc?.status !== 'Approved') {
    res.status(403)
    throw new Error('Corporate KYC must be approved before managing projects')
  }
  return user
}

export const findOwnedProject = async (id, developerId) => {
  const query = { isDeleted: false, developer: developerId }
  const mongoId = sanitizeMongoId(id)
  if (mongoId) {
    query._id = mongoId
  } else {
    query.uuid = String(id || '').trim()
  }
  if (!query._id && !query.uuid) return null
  return DeveloperProject.findOne(query)
}

export const requireOwnedProject = async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const project = await findOwnedProject(req.params.projectId || req.params.id, user._id)
  if (!project) {
    res.status(404)
    throw new Error('Project not found')
  }
  return { user, project }
}
