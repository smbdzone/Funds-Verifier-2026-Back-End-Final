import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

/**
 * Helper: Generate user key safely for IPv6
 */
const userKeyGenerator = (req) => {
  if (req.user?.uuid) return `user-${req.user.uuid}`
  if (req.user?._id) return `user-${req.user._id}`
  if (req.publicUser?.jti) return `public-${req.publicUser.jti}`
  return ipKeyGenerator(req)
}

/**
 * Global API limiter (dynamic: admin vs normal users)
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => {
    if (req.user?.role === 'Admin') return 1000
    if (req.user) return 200
    if (req.publicUser) return 100
    return 50
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
})

export const listingReadLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 100,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many listing requests from this IP. Please try again after some time.',
  },
})

/**
 * General rate limiter (per IP)
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 40,
  keyGenerator: ipKeyGenerator, // IPv6-safe
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
})

/**
 * User-specific limiter (per user ID or IP fallback)
 */
export const userRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit reached: Only 10 attempts allowed per hour.',
  },
})

/**
 * Public route limiter (strict IP-based)
 */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, slow down.',
})

/**
 * Public form limiters (contact, email, review, signup)
 */
export const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    if (req.user?.role === 'Admin') return 100 // Admins can post more
    if (req.user) return 20 // Authenticated users
    return 10 // Public users
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many submissions from this user/IP, please try later.',
  },
})

export const contactFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many contact requests from this IP, please try again later.',
  },
})

export const emailFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many email requests from this IP, please try again later.',
  },
})

export const signupLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 signups per IP per day
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many signup attempts from this IP, please try again later.',
  },
})

export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 reviews per IP
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many reviews from this IP, please try again later.',
  },
})

/**
 * Login-specific rate limits
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim()
    if (email) return `login-account-${email}`
    return ipKeyGenerator(req)
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many failed login attempts. Please try again in 15 minutes.',
  },
})

export const loginIpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again later.',
  },
})

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => {
    if (req.body?.email) {
      return `password-reset-${req.body.email.toLowerCase()}`
    }
    return ipKeyGenerator(req)
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset attempts. Please try again in 1 hour.',
  },
})

export const userUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.user?.role === 'Admin') return 50 // Admins can update more
    return 10
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many update attempts. Please try again in 15 minutes.',
  },
})

export const financialInfoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    if (req.user?.role === 'Admin') return 100
    return 20
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many requests for financial information. Please try again in 1 hour.',
  },
})

export const bookingCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    if (req.user?.role === 'Admin') return 100
    return 20
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many booking creation attempts. Please try again in 1 hour.',
  },
})

export const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => {
    if (req.user?.role === 'Admin') return 1000
    if (req.user) return 100
    return 10
  },
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many file upload attempts. Please try again in 1 hour.',
  },
})

export const adminActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  keyGenerator: userKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many admin actions. Please slow down.',
  },
})

export const publicTokenLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many public token requests. Please slow down.',
  },
})