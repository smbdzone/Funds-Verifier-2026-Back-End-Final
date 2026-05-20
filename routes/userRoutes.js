import express from 'express'
import {
  createUser,
  loginUser,
  getEvaluator,
  deleteUser,
  updateStatus,
  handleRefreshToken,
  handleLogout,
  getCurrentUser,
  getSingleUser,
  updateUser,
  getUserByRole,
  verifyUserToken,
  switchUser,
  uaePassLogin,
  storeUserThroughUaePass,
  GetUsersFinancialInfo,
  UpdateUsersFinancialInfo,
  verifyEmail,
  forgotPassword,
  resetPassword,
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
  passwordResetLimiter,
  userUpdateLimiter,
  financialInfoLimiter,
} from '../middlewares/rateLimiter.js'
import { authorize } from '../middlewares/advancedRBAC.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import {
  validateEmail,
  validateUUID,
  validateUserInputs,
} from '../middlewares/inputValidation.js'

const router = express.Router()

// create user
router.post(
  '/signup',
  signupLimiter,
  validateUserInputs,
  optionalAuthMiddleware,
  createUser,
)

// login user - limit to 10 attempts per user (email) per 24 hours
router.post('/login', loginIpLimiter, loginLimiter, validateEmail, loginUser)

// get specific role users
router.get(
  '/role/:role',
  authMiddleware,
  authorize('viewOthersProfile'),
  getEvaluator,
)

// verify email (public)
router.get('/verify-email', validateUUID, verifyEmail)

// delete user
router.delete(
  '/:id',
  authMiddleware,
  validateUUID,
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

// refresh token
router.get('/refresh', handleRefreshToken)

// logout (clears auth cookies)
router.get('/logout', handleLogout)

// verify-token
router.get('/verify-token', verifyUserToken)

// get current user (me) - uses token to identify user, no UUID needed
router.get('/me', authMiddleware, getCurrentUser)

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

// store UAE pass user info in db
router.post('/store-user', storeUserThroughUaePass)

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateEmail,
  forgotPassword,
)
router.post('/reset-password/:token', passwordResetLimiter, resetPassword)

export default router