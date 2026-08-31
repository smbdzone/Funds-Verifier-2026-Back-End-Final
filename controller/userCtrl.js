import asyncHandler from 'express-async-handler'
import User from '../models/userModel.js'
import Slot from '../models/Slot.js'
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
  sanitizeUserForAdmin,
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
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
  generateOtpCode,
  getResendWaitSeconds,
  hashOtpCode,
  maskEmail,
  requiresLoginOtp,
  sanitizeOtpCode,
} from '../utils/loginOtp.js'
import sendLoginOtpEmail from '../utils/loginOtpMail.js'
import {
  notifyBuyerFinanceApproved,
  notifyFvFinanceApprovalNeeded,
} from '../utils/fvPortalMail.js'

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

/** Readable by JS so the SPA can skip /user/me for anonymous visitors. */
const SESSION_HINT_COOKIE = 'fv_session'
const sessionHintCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 3 * 24 * 60 * 60 * 1000,
  ...(isProd && {
    domain: process.env.COOKIE_DOMAIN || '.fundsverifier.com',
  }),
}

const setSessionHintCookie = (res) => {
  res.cookie(SESSION_HINT_COOKIE, '1', sessionHintCookieOptions)
}

/** Remove auth cookies using every scope they may have been set with (avoids empty shells in DevTools). */
const clearAuthCookies = (res) => {
  const names = ['refreshToken', 'accessToken', 'role', SESSION_HINT_COOKIE]
  const scopes = [
    cookieOptions,
    sessionHintCookieOptions,
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
// Roles a member of the public may self-assign at signup (UAE Pass / email).
// Kept separate from PUBLIC_SIGNUP_ROLES so the buyer/seller role-switch stays limited.
const SELF_SIGNUP_ROLES = [
  'DealHunter',
  'AssetHolder',
  'Advertiser',
  'Developer',
]

const DEVELOPER_KYC_REQUIRED_DOCS = [
  'Trade License',
  'Certificate of Incorporation',
  'MOA',
  'UBO Passport',
  'Authorized Signer ID',
]

const getDeveloperPortalBase = () =>
  String(process.env.DEVELOPER_PORTAL_URL || 'http://localhost:3012').replace(
    /\/$/,
    '',
  )

const notifyDeveloperKycDecision = async (user, status, reviewNote = '') => {
  const note = String(reviewNote || '').trim()
  const companyName = String(user.developerKyc?.companyName || '').trim()
  const portalBase = getDeveloperPortalBase()

  if (status === 'Approved') {
    await createNotification({
      data: {
        userId: user._id,
        userUUID: user.uuid,
        UserRole: 'Developer',
        title: 'Corporate KYC Approved',
        message:
          'Your corporate KYC has been approved. You now have full access to the Developer Dashboard.',
        RelateRoute: '/dashboard',
      },
    })

    if (user.email) {
      sendEmail({
        to: user.email,
        subject: 'Funds Verifier — corporate KYC approved',
        html: `
          <h2>Corporate KYC approved</h2>
          <p>Hello ${user.name || 'Developer'},</p>
          <p>Funds Verifier has approved your corporate KYC and compliance review${companyName ? ` for <strong>${companyName}</strong>` : ''
          }.</p>
          <p>Your Developer Portal account is now active. Sign in to access your dashboard, manage projects, and list inventory.</p>
          <p><a href="${portalBase}/dashboard">Go to Developer Dashboard</a></p>
          ${note
            ? `<p><strong>Note from reviewer:</strong> ${note}</p>`
            : ''
          }
          <p>Thank you for partnering with Funds Verifier.</p>
        `,
      }).then((result) => {
        if (!result.success) {
          console.warn(`KYC approval email failed: ${result.error}`)
        }
      })
    }
    return
  }

  if (status === 'Rejected') {
    await createNotification({
      data: {
        userId: user._id,
        userUUID: user.uuid,
        UserRole: 'Developer',
        title: 'Corporate KYC Not Approved',
        message: note
          ? `Your corporate KYC was not approved. Reviewer note: ${note}`
          : 'Your corporate KYC was not approved. Please review your submission and resubmit.',
        RelateRoute: '/dashboard/kyc',
      },
    })

    if (user.email) {
      sendEmail({
        to: user.email,
        subject: 'Funds Verifier — corporate KYC update',
        html: `
          <h2>Corporate KYC not approved</h2>
          <p>Hello ${user.name || 'Developer'},</p>
          <p>After review, Funds Verifier was unable to approve your corporate KYC submission at this time.</p>
          ${note
            ? `<p><strong>Reviewer note:</strong> ${note}</p>`
            : ''
          }
          <p>Please sign in to the Developer Portal, review your documents, and resubmit under <strong>Corporate KYC</strong>.</p>
          <p><a href="${portalBase}/dashboard/kyc">Update Corporate KYC</a></p>
        `,
      }).then((result) => {
        if (!result.success) {
          console.warn(`KYC rejection email failed: ${result.error}`)
        }
      })
    }
    return
  }

  await createNotification({
    data: {
      userId: user._id,
      userUUID: user.uuid,
      UserRole: 'Developer',
      title: 'Corporate KYC',
      message: `Your corporate KYC status is updated to: ${status}`,
      RelateRoute: '/dashboard/kyc',
    },
  })
}

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

  // Self-registration roles must work even if another app on localhost left an
  // accessToken cookie (e.g. Evaluator session on :5002 blocking Developer on :3012).
  if (SELF_SIGNUP_ROLES.includes(normalizedRequestedRole)) {
    return { ok: true, role: normalizedRequestedRole }
  }

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
    return {
      ok: false,
      status: 400,
      message:
        'Public signup is only available for DealHunter, AssetHolder, Advertiser or Developer',
    }
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

  // Always use the official public site for verify links (not local FRONTEND_URL).
  const frontendBase = 'https://fundsverifier.com'
  const verificationLink = `${frontendBase}/verify-email?token=${token}&uuid=${user.uuid}`

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
      const isDeveloper = roleDecision.role === 'Developer'
      user = new User({
        name: normalizedName,
        email: sanitizedEmail,
        phone: phone || null,
        role: roleDecision.role,
        uuid: resolveUserUuid(uuid),
        userType,
        lastname: normalizedLastname,
        isEmailVerified: true,
        userState: isDeveloper ? 'inactive' : 'active',
        ...(isDeveloper
          ? {
            developerKyc: {
              status: 'NotStarted',
            },
          }
          : {}),
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
    setSessionHintCookie(res)

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
    companyName,
    username,
    jurisdiction,
    tradeLicenseNumber,
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

    const isDeveloper = roleDecision.role === 'Developer'
    const resolvedUsername = username ? String(username).trim() : ''
    if (isDeveloper) {
      if (!resolvedUsername) {
        return res.status(400).json({
          success: false,
          message: 'Username is required for Developer accounts',
        })
      }
      const usernameTaken = await User.findOne({
        'developerKyc.username': resolvedUsername,
        isDeleted: false,
      })
      if (usernameTaken) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken',
        })
      }
    }

    const newUser = new User({
      name: resolvedName,
      email: sanitizedEmail,
      password: hashedPassword,
      role: roleDecision.role,
      profileImage,
      phone,
      city,
      country: country || (isDeveloper && jurisdiction ? String(jurisdiction).trim() : undefined),
      parentEvaluator:
        creator?.role === 'Evaluator' && roleDecision.role === 'Sub-Evaluator'
          ? String(creator.uuid || creator._id)
          : parentEvaluator,
      userType,
      uuid: resolvedUuid,
      lastname: resolvedLastname,
      ...(isDeveloper
        ? {
          userState: 'inactive',
          developerKyc: {
            username: resolvedUsername,
            ...(companyName
              ? { companyName: String(companyName).trim() }
              : {}),
            ...(jurisdiction
              ? { jurisdiction: String(jurisdiction).trim() }
              : {}),
            ...(tradeLicenseNumber
              ? { tradeLicenseNumber: String(tradeLicenseNumber).trim() }
              : {}),
            status: 'NotStarted',
          },
        }
        : {}),
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
      developerKyc: newUser.developerKyc,
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

  if (requiresLoginOtp(findUser)) {
    return startLoginOtpChallenge(res, findUser)
  }

  return issueLoginSession(res, findUser)
})

/**
 * Issue auth cookies + tokens and return the self-view of the user.
 * Shared by password-only login and the OTP verification step.
 */
const issueLoginSession = async (res, user) => {
  const accessToken = generateToken(user._id)
  const refreshToken = generateRefreshToken(user._id)

  user.refreshToken = refreshToken
  user.loginOtpHash = undefined
  user.loginOtpExpiresAt = undefined
  user.loginOtpAttempts = 0
  await user.save()

  res.cookie('refreshToken', refreshToken, cookieOptions)

  const assignedRole = user.role

  res.cookie('accessToken', accessToken, { ...cookieOptions })
  res.cookie('role', assignedRole, { ...cookieOptions })
  setSessionHintCookie(res)

  const sanitizedUser = sanitizeUserForSelf(user)

  return res.json({
    ...sanitizedUser,
    accessToken,
    role: assignedRole,
    message: 'Login successful!',
  })
}

/** Generate + email a fresh code and tell the client to show the OTP screen. */
const startLoginOtpChallenge = async (res, user, { resend = false } = {}) => {
  const waitSeconds = getResendWaitSeconds(user.loginOtpSentAt)
  if (resend && waitSeconds > 0) {
    return res.status(429).json({
      otpRequired: true,
      email: user.email,
      maskedEmail: maskEmail(user.email),
      resendInSeconds: waitSeconds,
      message: `Please wait ${waitSeconds}s before requesting a new code.`,
    })
  }

  const code = generateOtpCode()

  user.loginOtpHash = hashOtpCode(code)
  user.loginOtpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000)
  user.loginOtpAttempts = 0
  user.loginOtpSentAt = new Date()
  await user.save()

  // Local/dev: always print the code so sign-in works even if inbox/spam delays.
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `\n[LOGIN OTP] ${user.email} → ${code} (expires in ${OTP_TTL_MINUTES}m)\n`,
    )
  }

  const mailResult = await sendLoginOtpEmail({
    to: user.email,
    recipientName: user.firstName || user.name || user.email,
    code,
    expiryMinutes: OTP_TTL_MINUTES,
  })

  if (!mailResult.success) {
    return res.status(502).json({
      otpRequired: true,
      email: user.email,
      maskedEmail: maskEmail(user.email),
      message:
        'We could not send your verification code right now. Please try again.',
    })
  }

  return res.status(200).json({
    otpRequired: true,
    email: user.email,
    maskedEmail: maskEmail(user.email),
    expiresInMinutes: OTP_TTL_MINUTES,
    resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    message: 'Check your email — we sent you a 6-digit verification code.',
  })
}

/** Look up an OTP-eligible user with the hidden OTP fields included. */
const findOtpUser = async (email) => {
  const sanitizedEmail = sanitizeEmail(email)
  if (!sanitizedEmail) return { error: 'Invalid email format' }

  const user = await User.findOne({ email: sanitizedEmail })
    .select('+loginOtpHash +loginOtpExpiresAt +loginOtpAttempts +loginOtpSentAt')
    .populate('parentEvaluator')

  if (!user || !requiresLoginOtp(user)) {
    return { error: 'Invalid or expired verification code' }
  }

  return { user }
}

const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { email, otp, code } = req.body

  const submitted = sanitizeOtpCode(otp ?? code)
  if (!submitted) {
    return res.status(400).json({ message: 'Enter the 6-digit code' })
  }

  const { user, error } = await findOtpUser(email)
  if (error) return res.status(401).json({ message: error })

  if (!user.loginOtpHash || !user.loginOtpExpiresAt) {
    return res
      .status(401)
      .json({ message: 'No active code. Please sign in again.' })
  }

  if (user.loginOtpExpiresAt.getTime() < Date.now()) {
    user.loginOtpHash = undefined
    user.loginOtpExpiresAt = undefined
    user.loginOtpAttempts = 0
    await user.save()
    return res
      .status(401)
      .json({ message: 'This code has expired. Please request a new one.' })
  }

  if ((user.loginOtpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
    user.loginOtpHash = undefined
    user.loginOtpExpiresAt = undefined
    user.loginOtpAttempts = 0
    await user.save()
    return res.status(429).json({
      message: 'Too many incorrect codes. Please sign in again.',
    })
  }

  const submittedHash = hashOtpCode(submitted)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(submittedHash),
    Buffer.from(user.loginOtpHash),
  )

  if (!isValid) {
    user.loginOtpAttempts = (user.loginOtpAttempts || 0) + 1
    await user.save()
    const attemptsLeft = Math.max(OTP_MAX_ATTEMPTS - user.loginOtpAttempts, 0)
    return res.status(401).json({
      message: attemptsLeft
        ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
        : 'Incorrect code. Please sign in again.',
      attemptsLeft,
    })
  }

  return issueLoginSession(res, user)
})

const resendLoginOtp = asyncHandler(async (req, res) => {
  const { user, error } = await findOtpUser(req.body?.email)
  if (error) return res.status(401).json({ message: error })

  if (!user.loginOtpSentAt) {
    return res
      .status(401)
      .json({ message: 'No active sign-in request. Please sign in again.' })
  }

  return startLoginOtpChallenge(res, user, { resend: true })
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
  setSessionHintCookie(res)

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
      const isApproved = String(status || '').trim() === 'Approved'
      const NotificationData = {
        userId: updatedUser?._id,
        userUUID: updatedUser?.uuid,
        UserRole: 'DealHunter',
        title: 'Financial Info',
        message: isApproved
          ? 'Your finance information is approved. You can now view private listings your funds cover.'
          : `Your financial info status is updated to: ${status || 'Pending'}`,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (String(status || '').trim() === 'Approved') {
      notifyBuyerFinanceApproved({ user: updatedUser }).catch((err) => {
        console.warn(
          'Buyer finance approved email failed:',
          err?.message || err,
        )
      })
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
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
      })
      .populate({
        path: 'financialInfo.verificationCertificate',
        select:
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
      })

    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    const sanitizedUser = await sanitizeUserForSelf(currentUser)
    setSessionHintCookie(res)
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
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
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

  // Arrange Viewing: only return trustees who currently have open viewing slots.
  // Legacy/empty trustee accounts (e.g. "Simo" with no slots) stay hidden.
  if (role === 'Trustee') {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const withSlots = []
    for (const user of users) {
      const hasSlots = await Slot.exists({
        userUUID: user.uuid,
        slotCategory: 'viewing',
        isDeleted: { $ne: true },
        date: { $gte: today },
        'times.isBooked': false,
      })
      if (hasSlots) withSlots.push(user)
    }
    return res.json(withSlots)
  }

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
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
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

    if (req.body.removeDocumentation) {
      const removeType = String(
        req.body.removeDocumentation?.type || req.body.removeDocumentation || '',
      ).trim()
      if (!removeType) {
        return res.status(400).json({ message: 'Document type is required' })
      }

      upUser = await User.findOneAndUpdate(
        { _id: loggedInUser?._id },
        { $pull: { documentation: { type: removeType } } },
        { new: true },
      )
        .select('-password')
        .populate({
          path: 'documentation.document',
          select:
            'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
        })
        .populate({
          path: 'financialInfo.verificationCertificate',
          select:
            'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
        })

      // If this was an admin-requested KYC doc, open the request again
      if (upUser?.role === 'Developer') {
        const requests = upUser.developerKyc?.requestedDocuments || []
        let changed = false
        for (const reqDoc of requests) {
          if (
            String(reqDoc.name || '').trim().toLowerCase() ===
            removeType.toLowerCase() &&
            reqDoc.status === 'Fulfilled'
          ) {
            reqDoc.status = 'Pending'
            changed = true
          }
        }
        if (changed) {
          upUser.markModified('developerKyc.requestedDocuments')
          await upUser.save()
        }
      }

      const sanitizedRemoved = await sanitizeUserForSelf(upUser)
      return res.json(sanitizedRemoved)
    }

    if (req.body.documentation) {
      const docType = String(req.body.documentation?.type || '').trim()
      // Replace: drop previous entries of the same type before pushing the new one
      if (req.body.replaceDocumentation && docType) {
        await User.updateOne(
          { _id: loggedInUser?._id },
          { $pull: { documentation: { type: docType } } },
        )
      }

      upUser = await User.findOneAndUpdate(
        { _id: loggedInUser?._id },
        { $push: { documentation: req.body.documentation } },
        { new: true },
      )
        .select('-password')
        .populate({
          path: 'documentation.document',
          select:
            'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
        })
        .populate({
          path: 'financialInfo.verificationCertificate',
          select:
            'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
        })

      // Mark matching Super Admin document requests as fulfilled
      if (docType && upUser?.role === 'Developer') {
        const requests = upUser.developerKyc?.requestedDocuments || []
        let changed = false
        for (const reqDoc of requests) {
          if (
            String(reqDoc.name || '').trim().toLowerCase() ===
            docType.toLowerCase() &&
            reqDoc.status !== 'Fulfilled'
          ) {
            reqDoc.status = 'Fulfilled'
            changed = true
          }
        }
        if (changed) {
          upUser.markModified('developerKyc.requestedDocuments')
          await upUser.save()
        }
      }

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
    // Developers cannot self-approve KYC via profile update.
    delete updatePayload.developerKyc
    delete updatePayload.userState

    if (updatePayload.emiratesId) {
      try {
        updatePayload.emiratesId = sanitizeEmiratesIdPayload(
          updatePayload.emiratesId,
        )
      } catch (err) {
        return res.status(err.statusCode || 400).json({ message: err.message })
      }
    }

    let financeFormSubmitted = false
    if (
      updatePayload.financialInfo &&
      typeof updatePayload.financialInfo === 'object'
    ) {
      const fi = { ...updatePayload.financialInfo }
      delete updatePayload.financialInfo
      // Deal hunters cannot self-approve. Saving the bank form always
      // sends the statement back to Super Admin as Pending.
      delete fi.status
      fi.status = 'Pending'
      financeFormSubmitted = true

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
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
      })
      .populate({
        path: 'financialInfo.verificationCertificate',
        select:
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
      })

    try {
      const NotificationData = {
        userId: upUser?.uuid,
        UserRole: upUser?.role,
        title: financeFormSubmitted ? 'Financial Info' : 'Update Profile',
        message: financeFormSubmitted
          ? 'Your finance information was submitted. Super Admin must approve it before you can see private listings.'
          : `Your profile info has been updated.`,
        RelateRoute: 'profile',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (financeFormSubmitted) {
      notifyFvFinanceApprovalNeeded({ user: upUser }).catch((err) => {
        console.warn(
          'Finance approval request email failed:',
          err?.message || err,
        )
      })
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
            'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
        })

      if (!userDoc) {
        return res.status(404).json({ message: 'User not found' })
      }
    }

    res.cookie('accessToken', accessToken, { ...cookieOptions })
    res.cookie('role', newRole, { ...cookieOptions })
    setSessionHintCookie(res)

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

// Set the requesting user's ad-targeting attributes (city / gender / ageGroup).
// Used by the advertiser onboarding fallback when UAE Pass didn't supply them.
const updateTargetingProfile = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const { city, gender, dateOfBirth } = req.body
  const update = {}
  if (typeof city === 'string' && city.trim()) update.city = city.trim()
  if (typeof gender === 'string' && gender.trim())
    update.gender = gender.trim().toLowerCase()
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth)
    if (!isNaN(dob.getTime())) update.dateOfBirth = dob
  }

  if (Object.keys(update).length === 0) {
    return res
      .status(400)
      .json({ success: false, message: 'No targeting fields provided' })
  }

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $set: update },
    { new: true },
  ).select('-password')

  return res.status(200).json({
    success: true,
    message: 'Targeting profile updated',
    user: updated,
  })
})

const getUploadedDocTypes = (user) =>
  (user?.documentation || [])
    .map((doc) => String(doc?.type || '').trim())
    .filter(Boolean)

const hasRequiredDeveloperKycDocs = (user) => {
  const types = new Set(getUploadedDocTypes(user))
  return DEVELOPER_KYC_REQUIRED_DOCS.every((required) => types.has(required))
}

const updateDeveloperKycProfile = asyncHandler(async (req, res) => {
  const requester = req.user
  if (!requester) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const user = await User.findById(requester._id)
  if (!user || user.isDeleted) {
    return res.status(404).json({ success: false, message: 'User not found' })
  }
  if (user.role !== 'Developer') {
    return res.status(403).json({
      success: false,
      message: 'Only Developer accounts can update corporate KYC profile',
    })
  }

  const { companyName, jurisdiction, tradeLicenseNumber } = req.body
  const kyc = user.developerKyc || {}

  if (companyName !== undefined) {
    kyc.companyName = String(companyName || '').trim()
  }
  if (jurisdiction !== undefined) {
    kyc.jurisdiction = String(jurisdiction || '').trim()
    if (kyc.jurisdiction) user.country = kyc.jurisdiction
  }
  if (tradeLicenseNumber !== undefined) {
    kyc.tradeLicenseNumber = String(tradeLicenseNumber || '').trim()
  }

  if (!kyc.status || kyc.status === 'NotStarted') {
    kyc.status = 'NotStarted'
  }

  user.developerKyc = kyc
  await user.save()

  const sanitizedUser = await sanitizeUserForSelf(user)
  return res.status(200).json({
    success: true,
    message: 'Company profile updated',
    user: sanitizedUser,
  })
})

const submitDeveloperKyc = asyncHandler(async (req, res) => {
  const requester = req.user
  if (!requester) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }

  const user = await User.findById(requester._id).populate({
    path: 'documentation.document',
    select:
      'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
  })

  if (!user || user.isDeleted) {
    return res.status(404).json({ success: false, message: 'User not found' })
  }
  if (user.role !== 'Developer') {
    return res.status(403).json({
      success: false,
      message: 'Only Developer accounts can submit corporate KYC',
    })
  }

  if (user.developerKyc?.status === 'Approved') {
    return res.status(400).json({
      success: false,
      message: 'Corporate KYC is already approved',
    })
  }

  const companyName = String(user.developerKyc?.companyName || '').trim()
  const jurisdiction = String(user.developerKyc?.jurisdiction || '').trim()
  const tradeLicenseNumber = String(
    user.developerKyc?.tradeLicenseNumber || '',
  ).trim()

  if (!companyName || !jurisdiction || !tradeLicenseNumber) {
    return res.status(400).json({
      success: false,
      message:
        'Company name, jurisdiction, and trade license number are required before submit',
    })
  }

  if (!hasRequiredDeveloperKycDocs(user)) {
    return res.status(400).json({
      success: false,
      message: `Upload all required documents: ${DEVELOPER_KYC_REQUIRED_DOCS.join(', ')}`,
      requiredDocs: DEVELOPER_KYC_REQUIRED_DOCS,
      uploadedDocs: getUploadedDocTypes(user),
    })
  }

  user.developerKyc = {
    ...(user.developerKyc?.toObject?.() || user.developerKyc || {}),
    companyName,
    jurisdiction,
    tradeLicenseNumber,
    status: 'Pending',
    submittedAt: new Date(),
    reviewedAt: undefined,
    reviewNote: '',
  }
  user.userState = 'inactive'
  await user.save()

  const sanitizedUser = await sanitizeUserForSelf(user)
  return res.status(200).json({
    success: true,
    message: 'Corporate KYC submitted for review',
    user: sanitizedUser,
  })
})

const GetDeveloperKycQueue = asyncHandler(async (req, res) => {
  try {
    const users = await User.find({
      isDeleted: false,
      role: 'Developer',
      'developerKyc.status': {
        $in: ['Pending', 'Submitted', 'Approved', 'Rejected', 'NotStarted'],
      },
    })
      .select(
        'name lastname email phone country developerKyc documentation createdAt uuid',
      )
      .sort({ 'developerKyc.submittedAt': -1, createdAt: -1 })

    return res.status(200).json({ users, success: true })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const GetDeveloperKycById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const user = await User.findOne({
      _id: id,
      isDeleted: false,
      role: 'Developer',
    })
      .select('-password -refreshToken')
      .populate({
        path: 'documentation.document',
        select:
          'Certificate.name Certificate.s3Key Certificate.s3Bucket Certificate.encrypted Certificate.url uuid',
      })

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const sanitized = await sanitizeUserForAdmin(user)
    return res.status(200).json({ user: sanitized, success: true })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const UpdateDeveloperKycStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const { status, reviewNote } = req.body

    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved, Rejected, or Pending',
      })
    }

    const user = await User.findOne({
      _id: id,
      isDeleted: false,
      role: 'Developer',
    })
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    user.developerKyc = {
      ...(user.developerKyc?.toObject?.() || user.developerKyc || {}),
      status,
      reviewedAt: new Date(),
      reviewNote: reviewNote ? String(reviewNote).trim() : '',
    }
    user.userState = status === 'Approved' ? 'active' : 'inactive'
    await user.save()

    try {
      await notifyDeveloperKycDecision(
        user,
        status,
        user.developerKyc?.reviewNote || reviewNote,
      )
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({ user, success: true })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

const RequestDeveloperKycDocuments = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const rawDocs = Array.isArray(req.body?.documents)
      ? req.body.documents
      : req.body?.name
        ? [{ name: req.body.name, note: req.body.note }]
        : []

    const documents = rawDocs
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim()
          return name ? { name, note: '' } : null
        }
        const name = String(item?.name || '').trim()
        if (!name) return null
        return {
          name,
          note: String(item?.note || '').trim(),
        }
      })
      .filter(Boolean)

    if (!documents.length) {
      return res.status(400).json({
        success: false,
        message: 'Add at least one document name to request',
      })
    }

    const user = await User.findOne({
      _id: id,
      isDeleted: false,
      role: 'Developer',
    })
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const kyc = {
      ...(user.developerKyc?.toObject?.() || user.developerKyc || {}),
    }
    const existing = Array.isArray(kyc.requestedDocuments)
      ? [...kyc.requestedDocuments]
      : []

    const now = new Date()
    for (const doc of documents) {
      const idx = existing.findIndex(
        (d) =>
          String(d.name || '').trim().toLowerCase() === doc.name.toLowerCase(),
      )
      const entry = {
        name: doc.name,
        note: doc.note || '',
        requestedAt: now,
        status: 'Pending',
      }
      if (idx >= 0) existing[idx] = { ...existing[idx], ...entry }
      else existing.push(entry)
    }

    kyc.requestedDocuments = existing
    // Keep under review so developer can upload the requested files
    if (!kyc.status || kyc.status === 'NotStarted' || kyc.status === 'Approved') {
      kyc.status = 'Pending'
    }
    user.developerKyc = kyc
    user.userState = 'inactive'
    await user.save()

    const names = documents.map((d) => d.name).join(', ')
    try {
      await createNotification({
        data: {
          userId: user._id,
          userUUID: user.uuid,
          UserRole: 'Developer',
          title: 'Document Request',
          message: `Funds Verifier requested additional KYC documents: ${names}. Please upload them in Corporate KYC.`,
          RelateRoute: '/dashboard/kyc',
        },
      })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (user.email) {
      sendEmail({
        to: user.email,
        subject: 'Funds Verifier — additional KYC documents requested',
        html: `
          <h2>Additional documents requested</h2>
          <p>Hello ${user.name || 'Developer'},</p>
          <p>Funds Verifier Super Admin has requested the following document(s) for your corporate KYC:</p>
          <ul>${documents.map((d) => `<li><strong>${d.name}</strong>${d.note ? ` — ${d.note}` : ''}</li>`).join('')}</ul>
          <p>Please sign in to the Developer Portal and upload them under <strong>Corporate KYC</strong>.</p>
        `,
      }).then((result) => {
        if (!result.success) {
          console.warn(`Document request email failed: ${result.error}`)
        }
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Document request sent to developer',
      user,
    })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.message || 'Something went wrong!' })
  }
})

export {
  createUser,
  loginUser,
  verifyLoginOtp,
  resendLoginOtp,
  getEvaluator,
  updateStatus,
  updateTargetingProfile,
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
  updateDeveloperKycProfile,
  submitDeveloperKyc,
  GetDeveloperKycQueue,
  GetDeveloperKycById,
  UpdateDeveloperKycStatus,
  RequestDeveloperKycDocuments,
}
