import asyncHandler from 'express-async-handler'
import User from '../models/userModel.js'
import generateToken from '../config/jwToken.js'
import generateRefreshToken from '../config/refreshToken.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { createNotification } from '../controller/notifications.controller.js'
import { clean } from './emailCtrl.js'
import sendEmail from '../utils/nodeMailer.js'
import { verifyToken } from '../middlewares/JwtAuth.js'
import validateMongoId from '../utils/validateMongodbId.js'
import {
  sanitizeUser,
  sanitizeUserForSelf,
  sanitizeUserForPublic,
} from '../utils/userSanitizer.js'
import { validatePassword } from '../utils/passwordValidator.js'
import {
  sanitizeEmail,
  sanitizeUUID,
  sanitizeMongoId,
} from '../utils/nosqlSanitizer.js'
import { sanitizeEmiratesIdPayload } from '../utils/emiratesIdValidator.js'
import {
  parseUaePassName,
  hasMalformedUaePassName,
} from '../utils/parseUaePassName.js'
import {
  isParentEvaluatorOf,
  isSubEvaluatorRole,
} from '../utils/parentEvaluator.js'

// Base cookie options object
const isProd = process.env.NODE_ENV === 'production'

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 3 * 24 * 60 * 60 * 1000,
  ...(isProd && {
    domain: process.env.COOKIE_DOMAIN || '.fundsverifier.com',
  }),
}

/** Remove auth cookies using every scope they may have been set with (avoids empty shells in DevTools). */
const clearAuthCookies = (res) => {
  const names = ['refreshToken', 'accessToken', 'role']
  const scopes = [
    cookieOptions,
    {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      httpOnly: true,
    },
    {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      httpOnly: false,
    },
  ]

  if (isProd && cookieOptions.domain) {
    scopes.push(
      {
        path: '/',
        secure: true,
        sameSite: 'none',
        domain: cookieOptions.domain,
        httpOnly: true,
      },
      {
        path: '/',
        secure: true,
        sameSite: 'none',
        domain: cookieOptions.domain,
        httpOnly: false,
      },
    )
  }

  for (const name of names) {
    for (const opts of scopes) {
      res.clearCookie(name, opts)
    }
  }
}

const isNonEmptyCookieValue = (value) =>
  typeof value === 'string' && value.trim().length > 0

const PRIVILEGED_ROLES = [
  'Admin',
  'Evaluator',
  'TechnicalReport',
  '3dWalkthrough',
]
/** Public signup: missing role defaults to DealHunter; only public roles are allowed unauthenticated */
const DEFAULT_PUBLIC_ROLE = 'DealHunter'
const PUBLIC_SIGNUP_ROLES = ['DealHunter', 'AssetHolder']

/**
 * Same token sources as authMiddleware: Bearer header or accessToken cookie.
 *
 * Signup behavior:
 * - If no token is present: apply "public signup" rules.
 * - If a token is present but invalid/expired: return 401 (not "public").
 */
const getSignupCreatorFromRequest = async (req) => {
  const header = req.headers?.authorization
  let token = null
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1]
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken
  }

  const tokenPresent = Boolean(token)
  if (!tokenPresent || !process.env.SECRET_KEY) {
    return { creator: null, tokenPresent: false }
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY, {
      algorithms: ['HS256'],
    })
    if (!decoded?.id) {
      return { creator: null, tokenPresent: true }
    }

    const creator = await User.findOne({
      _id: decoded.id,
      isDeleted: false,
    }).select('role _id uuid name lastname')

    return { creator: creator || null, tokenPresent: true }
  } catch {
    return { creator: null, tokenPresent: true }
  }
}

const resolveSignupRole = ({ requestedRole, creator, tokenPresent }) => {
  const normalizedRequestedRole = requestedRole || DEFAULT_PUBLIC_ROLE

  if (!creator) {
    if (tokenPresent) {
      return {
        ok: false,
        status: 401,
        message: 'Unauthorized',
      }
    }
    if (PRIVILEGED_ROLES.includes(normalizedRequestedRole)) {
      return {
        ok: false,
        status: 403,
        message: 'Public signup cannot assign privileged roles',
      }
    }
    if (!PUBLIC_SIGNUP_ROLES.includes(normalizedRequestedRole)) {
      return {
        ok: false,
        status: 400,
        message: 'Public signup is only available for DealHunter or AssetHolder',
      }
    }
    return { ok: true, role: normalizedRequestedRole }
  }

  if (creator.role === 'Admin') {
    return { ok: true, role: normalizedRequestedRole }
  }

  if (creator.role === 'Evaluator') {
    const allowedByEvaluator = ['Sub-Evaluator']
    if (!allowedByEvaluator.includes(normalizedRequestedRole)) {
      return {
        ok: false,
        status: 403,
        message:
          'Evaluator can only create Sub-Evaluator accounts (linked as your team member)',
      }
    }
    return { ok: true, role: normalizedRequestedRole }
  }

  return {
    ok: false,
    status: 403,
    message: 'You are not allowed to create users with this endpoint',
  }
}

const resolveUserUuid = (uuid) => {
  if (uuid && String(uuid).trim()) return String(uuid).trim()
  return crypto.randomUUID()
}

const uaePassLogin = asyncHandler(async (req, res) => {
  const CLIENT_ID = process.env.CLIENT_ID
  const CLIENT_SECRET = process.env.CLIENT_SECRET

  const AUTH_HEADER = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    'base64',
  )

  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' })
  }

  try {
    const tokenUrl =
      process.env.UAE_PASS_TOKEN_URL || 'https://id.uaepass.ae/idshub/token'
    const params = new URLSearchParams()
    params.append('grant_type', 'authorization_code')
    params.append('redirect_uri', `${process.env.REDIRECT_URI}`)
    params.append('code', code)

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${AUTH_HEADER}`,
      },
      body: params.toString(),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokenData)
    }

    const userInfoUrl =
      process.env.UAE_PASS_USERINFO_URL ||
      'https://id.uaepass.ae/idshub/userinfo'
    const userInfoResponse = await fetch(userInfoUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const userInfo = await userInfoResponse.json()

    const userExist = await User.findOne({
      email: userInfo?.email,
      isDeleted: false,
    }).select('-password')

    if (userExist) {
      return res.status(200).json({ message: 'User exist', user: userInfo })
    }

    return res.status(userInfoResponse.status).json(userInfo)
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch token or user info',
      details: error.message,
    })
  }
})

const createVerificationToken = () => crypto.randomBytes(32).toString('hex')

const sendVerificationEmail = async (user) => {
  const token = createVerificationToken()
  user.emailVerificationToken = token
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000
  await user.save()

  const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}&uuid=${user.uuid}`

  const html = `
    <h2>Email Verification</h2>
    <p>Please click the link below to verify your email:</p>
    <a href="${verificationLink}">Verify Email</a>
    <p>Link expires in 24 hours.</p>
  `

  const result = await sendEmail({
    to: user.email,
    subject: 'Verify Your Email',
    html,
  })

  if (!result.success) {
    console.warn(
      `Verification email not sent to ${user.email}: ${result.error}`,
    )
  }
}

const verifyEmail = asyncHandler(async (req, res) => {
  const { token, uuid } = req.query

  const sanitizedUUID = sanitizeUUID(uuid)
  if (!sanitizedUUID) {
    return res.status(400).json({
      success: false,
      message: 'Invalid UUID format',
    })
  }

  const user = await User.findOne({
    uuid: sanitizedUUID,
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: Date.now() },
  })

  if (!user)
    return res.status(400).json({ message: 'Invalid or expired token' })

  user.isEmailVerified = true
  user.userState = 'active'
  user.emailVerificationToken = undefined
  user.emailVerificationExpires = undefined
  await user.save()

  res.json({ success: true, message: 'Email verified successfully!' })
})

const storeUserThroughUaePass = asyncHandler(async (req, res) => {
  const { name, email, phone, role, uuid, userType, lastname } = req.body
  const parsedName = parseUaePassName(name, lastname)
  const normalizedName = parsedName.fullName || parsedName.firstName || name
  const normalizedLastname = parsedName.lastName || lastname

  try {
    const sanitizedEmail = sanitizeEmail(email)
    if (!sanitizedEmail) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email format' })
    }

    const { creator, tokenPresent } = await getSignupCreatorFromRequest(req)
    const roleDecision = resolveSignupRole({
      requestedRole: role,
      creator,
      tokenPresent,
    })
    if (!roleDecision.ok) {
      return res
        .status(roleDecision.status)
        .json({ success: false, message: roleDecision.message })
    }

    let user = await User.findOne({ email: sanitizedEmail, isDeleted: false })

    if (!user) {
      user = new User({
        name: normalizedName,
        email: sanitizedEmail,
        phone: phone || null,
        role: roleDecision.role,
        uuid: resolveUserUuid(uuid),
        userType,
        lastname: normalizedLastname,
        isEmailVerified: true,
        userState: 'active',
      })
      await user.save()
    } else if (
      parsedName.fullName &&
      (hasMalformedUaePassName(user.name) ||
        parsedName.fullName.length > String(user.name || '').length)
    ) {
      user.name = normalizedName
      if (normalizedLastname) {
        user.lastname = normalizedLastname
      }
      await user.save()
    }

    const accessToken = generateToken(user._id)
    const refreshToken = generateRefreshToken(user._id)

    user.refreshToken = refreshToken
    await user.save()

    res.cookie('refreshToken', refreshToken, cookieOptions)

    const assignedRole = user.role

    res.cookie('accessToken', accessToken, { ...cookieOptions })
    res.cookie('role', assignedRole, { ...cookieOptions })

    const sanitizedUser = await sanitizeUserForSelf(user)

    return res.status(200).json({
      ...sanitizedUser,
      accessToken,
      userType: user.userType,
      role: assignedRole,
      message: 'Login successful!',
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

const createUser = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    profileImage,
    phone,
    city,
    country,
    parentEvaluator,
    userType,
    uuid,
    lastname,
  } = req.body

  try {
    const { creator, tokenPresent } = await getSignupCreatorFromRequest(req)
    const roleDecision = resolveSignupRole({
      requestedRole: role,
      creator,
      tokenPresent,
    })
    const resolvedUuid = resolveUserUuid(uuid)

    if (!roleDecision.ok) {
      return res
        .status(roleDecision.status)
        .json({ success: false, message: roleDecision.message })
    }

    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors.join('. '),
      })
    }

    const sanitizedEmail = sanitizeEmail(email)
    if (!sanitizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }

    const existingUser = await User.findOne({
      email: sanitizedEmail,
      isDeleted: false,
    })
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: 'User already exists' })
    }

    let resolvedName = name && String(name).trim() ? String(name).trim() : ''
    let resolvedLastname =
      lastname && String(lastname).trim() ? String(lastname).trim() : undefined

    if (
      !resolvedName &&
      creator?.role === 'Evaluator' &&
      roleDecision.role === 'Sub-Evaluator' &&
      creator.name
    ) {
      resolvedName = String(creator.name).trim()
      if (!resolvedLastname && creator.lastname) {
        resolvedLastname = String(creator.lastname).trim()
      }
    }

    if (!resolvedName) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUser = new User({
      name: resolvedName,
      email: sanitizedEmail,
      password: hashedPassword,
      role: roleDecision.role,
      profileImage,
      phone,
      city,
      country,
      parentEvaluator:
        creator?.role === 'Evaluator' && roleDecision.role === 'Sub-Evaluator'
          ? String(creator.uuid || creator._id)
          : parentEvaluator,
      userType,
      uuid: resolvedUuid,
      lastname: resolvedLastname,
    })

    await newUser.save()

    const adminEmail = process.env.ADMIN_EMAIL || 'ashiqarooj846@gmail.com'

    const notifyByEmail = (payload) => {
      sendEmail(payload).then((result) => {
        if (!result.success) {
          console.warn(`Signup notification email failed: ${result.error}`)
        }
      })
    }

    notifyByEmail({
      to: adminEmail,
      subject: clean(`New User Registered: ${resolvedName}`),
      text: `A new user has registered.\n\nName: ${resolvedName}\nEmail: ${sanitizedEmail}\nRole: ${roleDecision.role}`,
    })

    if (parentEvaluator) {
      const sanitizedParentUUID = sanitizeUUID(parentEvaluator)
      if (!sanitizedParentUUID) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent evaluator UUID format',
        })
      }

      const parentUser = await User.findOne({ uuid: sanitizedParentUUID })
      if (parentUser && parentUser.email) {
        notifyByEmail({
          to: parentUser.email,
          subject: clean(`Your Evaluated User ${resolvedName} has registered`),
          text: `User ${resolvedName} (${sanitizedEmail}) has been assigned to you as parent evaluator.`,
        })
      }
    }

    notifyByEmail({
      to: sanitizedEmail,
      subject: clean(`Welcome to Funds Verifier, ${resolvedName}!`),
      text: `Hello ${resolvedName},\n\nYour account has been successfully created.\nEmail: ${sanitizedEmail}\nRole: ${roleDecision.role}`,
    })

    return res.status(201).json({
      uuid: newUser.uuid,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone || null,
      role: newUser.role,
      profileImage: newUser.profileImage,
      parentEvaluator: newUser.parentEvaluator,
      message: 'Registration successful!',
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  const sanitizedEmail = sanitizeEmail(email)
  if (!sanitizedEmail) {
    return res.status(400).json({ message: 'Invalid email format' })
  }

  const findUser = await User.findOne({ email: sanitizedEmail }).populate(
    'parentEvaluator',
  )
  if (!findUser) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  if (!findUser.isEmailVerified) {
    await sendVerificationEmail(findUser)
    return res.status(403).json({
      message: 'Please verify your email. A verification link has been sent.',
    })
  }

  const isMatch = await bcrypt.compare(password, findUser.password)
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid email or password' })
  }

  const accessToken = generateToken(findUser._id)
  const refreshToken = generateRefreshToken(findUser._id)

  findUser.refreshToken = refreshToken
  await findUser.save()

  res.cookie('refreshToken', refreshToken, cookieOptions)

  const assignedRole = findUser.role

  res.cookie('accessToken', accessToken, { ...cookieOptions })
  res.cookie('role', assignedRole, { ...cookieOptions })

  const sanitizedUser = sanitizeUserForSelf(findUser)

  res.json({
    ...sanitizedUser,
    accessToken,
    role: assignedRole,
    message: 'Login successful!',
  })
})

const getEvaluator = asyncHandler(async (req, res) => {
  const { role } = req.params

  try {
    const evaluators = await User.find({
      role,
      isDeleted: { $ne: true },
    }).select('-password -financialInfo -id -createdAt -updatedAt')

    res.status(200).json({
      message: 'All Evaluators',
      evaluators,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { userState } = req.body

  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const sanitizedId = sanitizeUUID(id)
    if (!sanitizedId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    let user = await User.findOne({ uuid: sanitizedId })

    if (!user) {
      const mongoId = sanitizeMongoId(id)
      if (mongoId) {
        user = await User.findOne({ _id: mongoId })
      }
    }

    if (!user) {
      return res.status(400).json({ message: 'User not found' })
    }

    const isAdmin = isAdminRole(requester?.role)
    const isParent = isParentEvaluatorOf(requester, user)

    if (!isAdmin && !isParent) {
      return res.status(403).json({
        message: 'Forbidden: Only Admin or parent evaluator can change user status',
      })
    }

    if (!isAdmin && isParent && !isSubEvaluatorRole(user.role)) {
      return res.status(403).json({
        message: 'Forbidden: Can only change status for sub-evaluators',
      })
    }

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { userState },
      { new: true },
    )

    res.status(200).json({
      message: 'User status updated successfully',
      user: updatedUser,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

const handleRefreshToken = asyncHandler(async (req, res) => {
  const cookies = req.cookies

  if (!isNonEmptyCookieValue(cookies?.refreshToken)) {
    return res
      .status(401)
      .json({ success: false, message: 'Refresh token missing' })
  }

  const oldRefreshToken = cookies.refreshToken.trim()

  const user = await User.findOne({
    refreshToken: oldRefreshToken,
    isDeleted: false,
  })

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token. Login required',
    })
  }

  let decoded
  try {
    decoded = jwt.verify(oldRefreshToken, process.env.SECRET_KEY)
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token expired. Please login again',
    })
  }

  if (decoded.id !== user.id.toString()) {
    return res.status(401).json({
      success: false,
      message: 'Token tampered or user mismatch',
    })
  }

  const newAccessToken = generateToken(user._id)

  const assignedRole = user.role

  res.cookie('accessToken', newAccessToken, { ...cookieOptions })
  res.cookie('role', assignedRole, { ...cookieOptions })

  return res.status(200).json({
    success: true,
    accessToken: newAccessToken,
  })
})

const GetUsersFinancialInfo = asyncHandler(async (req, res) => {
  try {
    const users = await User.find({
      isDeleted: false,
      financialInfo: { $exists: true, $ne: null },
      'financialInfo.fundsVerification': { $exists: true, $ne: '' },
    }).select('financialInfo name email phone')

    if (!users) throw new Error('User not found')

    return res.status(200).json({ users, success: true })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const UpdateUsersFinancialInfo = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!status)
      throw new Error('Status to update for financial statement is required!')

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { 'financialInfo.status': status || 'Pending' },
      { new: true },
    )

    if (!updatedUser) {
      throw new Error('User not found or failed to update!')
    }

    try {
      const NotificationData = {
        userId: updatedUser?._id,
        userUUID: updatedUser?.uuid,
        UserRole: 'DealHunter',
        title: 'Financial Info',
        message: `Your financial info status is updated to: ${status || 'Pending'}`,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({ user: updatedUser, success: true })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const currentUser = await User.findById(requester._id)
      .select('-password')
      .populate('parentEvaluator')
      .populate({
        path: 'documentation.document',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })
      .populate({
        path: 'financialInfo.verificationCertificate',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    const sanitizedUser = await sanitizeUserForSelf(currentUser)
    return res.status(200).json(sanitizedUser)
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const getSingleUser = asyncHandler(async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const targetUserId = req.userResource?._id || req.params.id

    validateMongoId(targetUserId)

    const isAdmin = requester.role === 'Admin'
    const isSelf = String(requester._id) === String(targetUserId)

    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        message: "Forbidden: Cannot access another user's data",
      })
    }

    const singleUser = await User.findById(targetUserId)
      .select('-password -financialInfo')
      .populate('parentEvaluator')
      .populate({
        path: 'documentation.document',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })

    if (!singleUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    const sanitizedUser = await sanitizeUser(singleUser, requester)
    return res.status(200).json(sanitizedUser)
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const verifyUserToken = asyncHandler(async (req, res) => {
  const { headers } = req
  const authorizationHeader = headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  const userIdFromToken = verifyToken(bearerToken)
  if (!userIdFromToken) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token is expired or invalid. Please login again.',
    })
  }
  return res.status(200).json({
    success: true,
    message: 'Token is valid',
  })
})

const SERVICE_PROVIDER_ROLES = new Set([
  'Evaluator',
  'TechnicalReport',
  '3dWalkthrough',
  'Trustee',
])

/** Minimal provider list for booking (asset holders / deal hunters). */
const getServiceProvidersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params

  if (!SERVICE_PROVIDER_ROLES.has(role)) {
    return res.status(400).json({ message: 'Invalid service provider role' })
  }

  const query = { role, isDeleted: { $ne: true } }
  if (role === 'Evaluator') {
    query.$or = [
      { parentEvaluator: { $exists: false } },
      { parentEvaluator: null },
      { parentEvaluator: '' },
    ]
  }

  const users = await User.find(query)
    .select('uuid name lastname role')
    .lean()

  res.json(users)
})

const getUserByRole = asyncHandler(async (req, res) => {
  const { role } = req.params
  const requester = req.user

  try {
    const users = await User.find({ role: role, isDeleted: false })
      .select('-password -financialInfo')
      .populate({
        path: 'documentation.document',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })

    const sanitizedUsers = await Promise.all(
      users.map(async (user) => {
        if (requester) return await sanitizeUser(user, requester)
        return sanitizeUserForPublic(user)
      }),
    )

    res.json(sanitizedUsers)
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const isAdminRole = (role) => {
  const roleNorm = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  return role === 'Admin' || roleNorm === 'superadmin'
}

const findUserByRouteId = async (id, { includeDeleted = false } = {}) => {
  const sanitizedUuid = sanitizeUUID(id)
  if (sanitizedUuid) {
    const query = { uuid: sanitizedUuid }
    if (!includeDeleted) {
      query.isDeleted = false
    }
    const byUuid = await User.findOne(query)
    if (byUuid) return byUuid
  }

  const mongoId = sanitizeMongoId(id)
  if (!mongoId) return null

  const query = { _id: mongoId }
  if (!includeDeleted) {
    query.isDeleted = false
  }
  return User.findOne(query)
}

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params
  const requester = req.user

  try {
    const isAdmin = isAdminRole(requester?.role)
    const user = await findUserByRouteId(id, { includeDeleted: isAdmin })

    if (!user) {
      return res
        .status(404)
        .json({ message: 'User not found or already deleted' })
    }

    if (isAdmin) {
      await User.deleteOne({ _id: user._id })

      try {
        const NotificationData = {
          UserRole: 'Admin',
          userUUID: req.user.uuid,
          title: 'User Deleted',
          message: `User (${user.email}) has been permanently deleted.`,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }

      return res.json({ message: 'User permanently deleted' })
    }

    if (user.isDeleted) {
      return res
        .status(404)
        .json({ message: 'User not found or already deleted' })
    }

    const isParent = isParentEvaluatorOf(requester, user)

    if (!isParent) {
      return res.status(403).json({
        message: 'Forbidden: Not allowed to delete this user',
      })
    }

    if (!isSubEvaluatorRole(user.role)) {
      return res.status(403).json({
        message: 'Forbidden: Can only delete sub-evaluators',
      })
    }

    await User.deleteOne({ _id: user._id })

    try {
      const NotificationData = {
        UserRole: 'Admin',
        userUUID: req.user.uuid,
        title: 'User Deleted',
        message: `Sub-evaluator (${user.email}) has been permanently deleted.`,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.json({ message: 'User permanently deleted' })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const updateUser = asyncHandler(async (req, res) => {
  const loggedInUser = req.userResource
  try {
    let upUser

    if (req.body.documentation) {
      upUser = await User.findOneAndUpdate(
        loggedInUser?._id,
        { $push: { documentation: req.body.documentation } },
        { new: true },
      )
        .select('-password')
        .populate({
          path: 'documentation.document',
          select:
            'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
        })
        .populate({
          path: 'financialInfo.verificationCertificate',
          select:
            'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
        })

      try {
        const NotificationData = {
          userId: upUser?._id,
          userUUID: upUser?.uuid,
          UserRole: upUser?.role,
          title: 'Update Documentation',
          message: `Your documentation info is updated.`,
          RelateRoute: 'profile',
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }

      const sanitizedUser = await sanitizeUserForSelf(upUser)
      return res.json(sanitizedUser)
    }

    const updatePayload = { ...req.body }
    // Role changes are not allowed from profile update endpoint for any user.
    delete updatePayload.role

    if (updatePayload.emiratesId) {
      try {
        updatePayload.emiratesId = sanitizeEmiratesIdPayload(
          updatePayload.emiratesId,
        )
      } catch (err) {
        return res.status(err.statusCode || 400).json({ message: err.message })
      }
    }

    if (
      updatePayload.financialInfo &&
      typeof updatePayload.financialInfo === 'object'
    ) {
      const fi = { ...updatePayload.financialInfo }
      delete updatePayload.financialInfo

      if (fi.status === undefined) {
        fi.status = loggedInUser?.financialInfo?.status || 'Pending'
      }

      for (const [key, value] of Object.entries(fi)) {
        if (value !== undefined && value !== null) {
          updatePayload[`financialInfo.${key}`] = value
        }
      }
    }

    upUser = await User.findOneAndUpdate(
      { _id: loggedInUser?._id },
      updatePayload,
      {
        new: true,
      },
    )
      .select('-password')
      .populate({
        path: 'documentation.document',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })
      .populate({
        path: 'financialInfo.verificationCertificate',
        select:
          'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
      })

    try {
      const NotificationData = {
        userId: upUser?.uuid,
        UserRole: upUser?.role,
        title: 'Update Profile',
        message: `Your profile info has been updated.`,
        RelateRoute: 'profile',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    const sanitizedUser = await sanitizeUserForSelf(upUser)
    return res.status(200).json(sanitizedUser)
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

const switchUser = asyncHandler(async (req, res) => {
  try {
    const paramUuid = sanitizeUUID(req.params.id)
    if (!paramUuid || paramUuid !== req.user.uuid) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const loggedInUser = req.userResource
    if (!loggedInUser) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    if (!PUBLIC_SIGNUP_ROLES.includes(loggedInUser.role)) {
      return res.status(403).json({
        message: 'Role switching is not available for this account type.',
      })
    }

    const newRole = req.body?.role
    if (!newRole || !PUBLIC_SIGNUP_ROLES.includes(newRole)) {
      return res.status(400).json({
        message:
          'Invalid role. You may only switch between DealHunter and AssetHolder.',
      })
    }

    const accessToken = generateToken(loggedInUser._id)

    let userDoc = loggedInUser
    if (newRole !== loggedInUser.role) {
      userDoc = await User.findByIdAndUpdate(
        loggedInUser._id,
        { role: newRole },
        { new: true },
      )
        .select('-password -financialInfo')
        .populate({
          path: 'documentation.document',
          select:
            'Certificate.name Certificate.s3Key Certificate.encrypted Certificate.url uuid',
        })

      if (!userDoc) {
        return res.status(404).json({ message: 'User not found' })
      }
    }

    res.cookie('accessToken', accessToken, { ...cookieOptions })
    res.cookie('role', newRole, { ...cookieOptions })

    const sanitizedUser = await sanitizeUserForSelf(userDoc)
    return res.status(200).json({
      user: { ...sanitizedUser, role: newRole },
      accessToken,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ message: err?.message || 'Something went wrong!' })
  }
})

const logoutUser = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken

  if (isNonEmptyCookieValue(refreshToken)) {
    await User.findOneAndUpdate(
      { refreshToken: refreshToken.trim() },
      { $unset: { refreshToken: 1 } },
    )
  }

  clearAuthCookies(res)

  res.json({ message: 'Logged out successfully' })
})

const validateToken = asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ valid: false, message: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY)
    const user = await User.findById(decoded.id, { isDeleted: false })

    if (!user) {
      return res.status(401).json({ valid: false, message: 'User not found' })
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        role: user.role,
      },
    })
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid token' })
  }
})

const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.'

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    const sanitizedEmail = sanitizeEmail(email)
    if (!sanitizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }

    const user = await User.findOne({ email: sanitizedEmail })
    if (!user || user.userType === 'SOP3') {
      return res.status(200).json({
        success: true,
        message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
      })
    }

    const resetToken = crypto.randomBytes(32).toString('hex')

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex')

    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000
    await user.save({ validateBeforeSave: false })

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`

    const message = `
Hello ${user.name},

You requested a password reset.

Click the link below to reset your password:
${resetUrl}

This link will expire in 15 minutes.

If you didn’t request this, please ignore this email.
`

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: message,
      })
    } catch (emailError) {
      console.error('Forgot password email failed:', emailError.message)
    }

    return res.status(200).json({
      success: true,
      message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params
    const { password } = req.body

    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.errors.join('. '),
      })
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token',
      })
    }

    const salt = await bcrypt.genSalt(10)
    user.password = await bcrypt.hash(password, salt)
    user.resetPasswordToken = undefined
    user.resetPasswordExpire = undefined

    await user.save()

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}

export {
  createUser,
  loginUser,
  getEvaluator,
  updateStatus,
  uaePassLogin,
  storeUserThroughUaePass,
  getCurrentUser,
  getSingleUser,
  deleteUser,
  updateUser,
  getUserByRole,
  getServiceProvidersByRole,
  switchUser,
  GetUsersFinancialInfo,
  sendVerificationEmail,
  verifyEmail,
  handleRefreshToken,
  UpdateUsersFinancialInfo,
  verifyUserToken,
  logoutUser as handleLogout,
  validateToken,
  forgotPassword,
  resetPassword,
}
