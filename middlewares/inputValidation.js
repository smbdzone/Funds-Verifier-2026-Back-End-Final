import asyncHandler from 'express-async-handler'
import { sanitizeEmail, sanitizeUUID, sanitizeMongoId, sanitizeNumber } from '../utils/nosqlSanitizer.js'

export const validateEmail = asyncHandler(async (req, res, next) => {
  const email = req.body?.email || req.query?.email || req.params?.email

  if (email) {
    const sanitized = sanitizeEmail(email)
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }
    if (req.body?.email) req.body.email = sanitized
    if (req.query?.email) req.query.email = sanitized
    if (req.params?.email) req.params.email = sanitized
  }

  next()
})

export const validateUUID = asyncHandler(async (req, res, next) => {
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid || req.params?.id

  if (uuid) {
    const sanitized = sanitizeUUID(uuid)
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    if (req.body?.uuid) req.body.uuid = sanitized
    if (req.query?.uuid) req.query.uuid = sanitized
    if (req.params?.uuid) req.params.uuid = sanitized
    if (req.params?.id) req.params.id = sanitized
  }

  next()
})

export const validateMongoIdParam = asyncHandler(async (req, res, next) => {
  const id = req.params?.id

  if (id) {
    const sanitized = sanitizeMongoId(id)
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format',
      })
    }

    req.params.id = sanitized
  }

  next()
})

export const validateStringLength = (field, maxLength = 1000, minLength = 0) => {
  return asyncHandler(async (req, res, next) => {
    const value = req.body?.[field] || req.query?.[field] || req.params?.[field]

    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: `${field} must be a string`,
        })
      }

      if (value.length < minLength) {
        return res.status(400).json({
          success: false,
          message: `${field} must be at least ${minLength} characters long`,
        })
      }

      if (value.length > maxLength) {
        return res.status(400).json({
          success: false,
          message: `${field} must not exceed ${maxLength} characters`,
        })
      }
    }

    next()
  })
}

export const validateRequired = (fields) => {
  return asyncHandler(async (req, res, next) => {
    const missing = []

    for (const field of fields) {
      const value = req.body?.[field] ?? req.query?.[field] ?? req.params?.[field]
      if (value === undefined || value === null || value === '') {
        missing.push(field)
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      })
    }

    next()
  })
}

export const validateNumber = (field, min = null, max = null) => {
  return asyncHandler(async (req, res, next) => {
    const value = req.body?.[field] || req.query?.[field] || req.params?.[field]

    if (value !== undefined && value !== null) {
      const num = sanitizeNumber(value)
      if (num === null) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a valid number`,
        })
      }

      if (min !== null && num < min) {
        return res.status(400).json({
          success: false,
          message: `${field} must be at least ${min}`,
        })
      }

      if (max !== null && num > max) {
        return res.status(400).json({
          success: false,
          message: `${field} must not exceed ${max}`,
        })
      }

      // Replace with sanitized number
      if (req.body?.[field]) req.body[field] = num
      if (req.query?.[field]) req.query[field] = num
      if (req.params?.[field]) req.params[field] = num
    }

    next()
  })
}

export const validateUserInputs = asyncHandler(async (req, res, next) => {
  // Validate email if present
  if (req.body?.email || req.query?.email || req.params?.email) {
    const email = req.body?.email || req.query?.email || req.params?.email
    const sanitized = sanitizeEmail(email)
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }
    if (req.body?.email) req.body.email = sanitized
    if (req.query?.email) req.query.email = sanitized
    if (req.params?.email) req.params.email = sanitized
  }

  // Validate UUID if present
  const uuid = req.body?.uuid || req.query?.uuid || req.params?.uuid || req.params?.id
  if (uuid) {
    const sanitized = sanitizeUUID(uuid)
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }
    if (req.body?.uuid) req.body.uuid = sanitized
    if (req.query?.uuid) req.query.uuid = sanitized
    if (req.params?.uuid) req.params.uuid = sanitized
    if (req.params?.id) req.params.id = sanitized
  }

  // Validate string lengths for common fields
  const stringFields = ['name', 'title', 'description', 'message', 'phone']
  for (const field of stringFields) {
    const value = req.body?.[field]
    if (value && typeof value === 'string') {
      if (value.length > 1000) {
        return res.status(400).json({
          success: false,
          message: `${field} must not exceed 1000 characters`,
        })
      }
    }
  }

  next()
})

export default {
  validateEmail,
  validateUUID,
  validateMongoIdParam,
  validateStringLength,
  validateRequired,
  validateNumber,
  validateUserInputs,
}
