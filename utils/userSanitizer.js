/**
 * User Data Sanitization Utility
 * Provides secure user data filtering based on requester role and access level
 */

import { sanitizeDocumentation } from './documentationSanitizer.js'

/**
 * Sanitize user data for self-access (full access to own data)
 * @param {Object} user - User document from database
 * @returns {Promise<Object>} - Sanitized user object with all fields except sensitive tokens
 */
export const sanitizeUserForSelf = async (user) => {
  if (!user) return null

  // Convert to plain object if Mongoose document
  const userObj = user.toObject ? user.toObject() : { ...user }

  // Remove sensitive internal tokens (financialInfo is included for self profile editing)
  const {
    password,
    refreshToken,
    passwordResetToken,
    passwordResetTokenExpiresAt,
    emailVerificationToken,
    emailVerificationExpires,
    pendingEmailChange,
    ...sanitized
  } = userObj

  // Sanitize documentation array
  if (sanitized.documentation) {
    sanitized.documentation = await sanitizeDocumentation(
      sanitized.documentation,
      true
    )
  }

  return sanitized
}

/**
 * Sanitize user data for public access (other users)
 * Only returns public fields, hides sensitive information
 * @param {Object} user - User document from database
 * @returns {Object} - Sanitized user object with only public fields
 */
export const sanitizeUserForPublic = (user) => {
  if (!user) return null

  // Convert to plain object if Mongoose document
  const userObj = user.toObject ? user.toObject() : { ...user }

  // Public fields that can be visible to other users
  const publicFields = {
    _id: userObj._id,
    uuid: userObj.uuid,
    name: userObj.name,
    lastname: userObj.lastname,
    profileImage: userObj.profileImage,
    role: userObj.role,
    about: userObj.about,
    userState: userObj.userState,
    propertyTypes: userObj.propertyTypes,
    region: userObj.region,
    country: userObj.country,
    city: userObj.city,
    gender: userObj.gender,
    maritalStatus: userObj.maritalStatus,
    createdAt: userObj.createdAt,
    updatedAt: userObj.updatedAt,
  }

  // Remove undefined/null fields
  Object.keys(publicFields).forEach(
    (key) => publicFields[key] === undefined && delete publicFields[key]
  )

  return publicFields
}

/**
 * Sanitize user data for Admin access (full access to all fields)
 * Admin can see all user data including sensitive fields
 * Note: Financial info is still excluded for security
 * @param {Object} user - User document from database
 * @returns {Promise<Object>} - Sanitized user object with all fields except internal tokens
 */
export const sanitizeUserForAdmin = async (user) => {
  if (!user) return null

  // Convert to plain object if Mongoose document
  const userObj = user.toObject ? user.toObject() : { ...user }

  // Remove only internal tokens and financial info (for security)
  const {
    password,
    refreshToken,
    passwordResetToken,
    passwordResetTokenExpiresAt,
    emailVerificationToken,
    emailVerificationExpires,
    pendingEmailChange,
    financialInfo,
    ...sanitized
  } = userObj

  // For admin: include signed URLs so Super Admin can open KYC files
  if (sanitized.documentation) {
    sanitized.documentation = await sanitizeDocumentation(
      sanitized.documentation,
      true,
    )
  }

  return sanitized
}

/**
 * Sanitize user data based on requester role and access level
 * @param {Object} user - User document to sanitize
 * @param {Object} requester - Requester user object with _id and role
 * @returns {Promise<Object>} - Sanitized user object
 */
export const sanitizeUser = async (user, requester) => {
  if (!user || !requester) return null

  const userObj = user.toObject ? user.toObject() : { ...user }
  const requesterId = requester._id?.toString() || requester._id
  const targetUserId = userObj._id?.toString() || userObj._id

  // Self-access: user viewing their own data
  if (requesterId === targetUserId) {
    return await sanitizeUserForSelf(user)
  }

  // Admin access: Admin viewing any user's data
  if (requester.role === 'Admin') {
    return await sanitizeUserForAdmin(user)
  }

  // Public access: other users viewing this user's data
  return sanitizeUserForPublic(user)
}

