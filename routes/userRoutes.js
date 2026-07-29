import express from 'express'
import {
  createUser,
  loginUser,
  verifyLoginOtp,
  resendLoginOtp,
  getEvaluator,
  deleteUser,
  updateStatus,
  handleRefreshToken,
  handleLogout,
  getCurrentUser,
  getSingleUser,
  updateUser,
  getUserByRole,
  getServiceProvidersByRole,
  verifyUserToken,
  switchUser,
  uaePassLogin,
  storeUserThroughUaePass,
  GetUsersFinancialInfo,
  UpdateUsersFinancialInfo,
  verifyEmail,
  forgotPassword,
  resetPassword,
  updateTargetingProfile,
  updateDeveloperKycProfile,
  submitDeveloperKyc,
  GetDeveloperKycQueue,
  GetDeveloperKycById,
  UpdateDeveloperKycStatus,
  RequestDeveloperKycDocuments,
} from '../controller/userCtrl.js'
import {
  authMiddleware,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminOnly.js'
import {
  signupLimiter,
  loginLimiter,
  loginIpLimiter,
  emailFormLimiter,
  passwordResetLimiter,
  userUpdateLimiter,
  financialInfoLimiter,
} from '../middlewares/rateLimiter.js'
import { authorize } from '../middlewares/advancedRBAC.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import {
  validateEmail,
  validateUUID,
  validateUserRouteId,
  validateUserInputs,
} from '../middlewares/inputValidation.js'

const router = express.Router()

// create user (public: max 5 signups per email per 24h)
router.post(
  '/signup',
  validateUserInputs,
  optionalAuthMiddleware,
  signupLimiter,
  createUser,
)

// login user - limit to 10 attempts per user (email) per 24 hours
router.post('/login', loginIpLimiter, loginLimiter, validateEmail, loginUser)

// step 2 of login for OTP-gated roles (Evaluator, Sub-Evaluator, ...)
router.post(
  '/login/verify-otp',
  loginIpLimiter,
  loginLimiter,
  validateEmail,
  verifyLoginOtp,
)
router.post(
  '/login/resend-otp',
  loginIpLimiter,
  emailFormLimiter,
  validateEmail,
  resendLoginOtp,
)

// get specific role users
router.get(
  '/role/:role',
  authMiddleware,
  authorize('viewOthersProfile'),
  getEvaluator,
)

// service providers for listing / evaluation booking (asset holders, deal hunters, etc.)
router.get(
  '/service-providers/:role',
  authMiddleware,
  getServiceProvidersByRole,
)

// verify email (public)
router.get('/verify-email', validateUUID, verifyEmail)

// delete user
router.delete(
  '/:id',
  authMiddleware,
  validateUserRouteId,
  authorize('deleteOthersAccount'),
  deleteUser,
)

// update user state - only for the authenticated user (id must match token user UUID)
router.put(
  '/:id',
  authMiddleware,
  userUpdateLimiter,
  validateUUID,
  authorizeUserByUUID,
  authorize('editOwnProfile'),
  updateStatus,
)

// financial statements (admin dashboard only)
router.get(
  '/financial-statements',
  ...adminOnly,
  financialInfoLimiter,
  GetUsersFinancialInfo,
)

router.put(
  '/financial-statements/:id',
  ...adminOnly,
  financialInfoLimiter,
  UpdateUsersFinancialInfo,
)

// Developer corporate KYC (must be before /:id)
router.put(
  '/developer-kyc/profile',
  authMiddleware,
  userUpdateLimiter,
  updateDeveloperKycProfile,
)
router.post(
  '/developer-kyc/submit',
  authMiddleware,
  userUpdateLimiter,
  submitDeveloperKyc,
)
router.get(
  '/developer-kyc',
  ...adminOnly,
  financialInfoLimiter,
  GetDeveloperKycQueue,
)
router.get(
  '/developer-kyc/:id',
  ...adminOnly,
  financialInfoLimiter,
  GetDeveloperKycById,
)
router.put(
  '/developer-kyc/:id',
  ...adminOnly,
  financialInfoLimiter,
  UpdateDeveloperKycStatus,
)
router.post(
  '/developer-kyc/:id/request-documents',
  ...adminOnly,
  financialInfoLimiter,
  RequestDeveloperKycDocuments,
)

// refresh token
router.get('/refresh', handleRefreshToken)

// logout (clears auth cookies)
router.get('/logout', handleLogout)

// verify-token
router.get('/verify-token', verifyUserToken)

// get current user (me) - uses token to identify user, no UUID needed
router.get('/me', authMiddleware, getCurrentUser)
router.put('/targeting-profile', authMiddleware, updateTargetingProfile)

// single user - requires auth, only admin can view any user, users can only view themselves
router.get(
  '/:id',
  authMiddleware,
  validateUUID,
  authorizeUserByUUID,
  getSingleUser,
)

// get users by role (admin dashboard only)
router.get('/role-id/:role', ...adminOnly, getUserByRole)

// switch user role/status
router.put(
  '/switch-user/:id',
  authMiddleware,
  userUpdateLimiter,
  validateUUID,
  authorizeUserByUUID,
  authorize('switchRoles'),
  switchUser,
)

// update user
router.put(
  '/update/:id',
  authMiddleware,
  userUpdateLimiter,
  validateUUID,
  authorizeUserByUUID,
  authorize('editOwnProfile'),
  updateUser,
)

// get UAE pass token
router.post('/get-token', uaePassLogin)

// store UAE pass user info in db (same signup rate limit for public registrations)
router.post(
  '/store-user',
  validateEmail,
  optionalAuthMiddleware,
  signupLimiter,
  storeUserThroughUaePass,
)

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateEmail,
  forgotPassword,
)
router.post('/reset-password/:token', passwordResetLimiter, resetPassword)

export default router