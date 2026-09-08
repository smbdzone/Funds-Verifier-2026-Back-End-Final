import Advertisement from '../models/advertisement.js'
import { verifyToken } from '../middlewares/JwtAuth.js'
import User from '../models/userModel.js'
import { createNotification } from '../controller/notifications.controller.js'
import { GetUserLocalization } from '../utils/localization/GetUserLocalization.js'
import { Types } from 'mongoose'
import validateMongoId from '../utils/validateMongodbId.js'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'
import { stripe } from '../libs/stripe.js'

const AD_IMG_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour


function extractS3KeyFromCloudFrontUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  const marker = 'cloudfront.net/'
  const idx = trimmed.indexOf(marker)
  if (idx === -1) return null

  const after = trimmed.slice(idx + marker.length)
  const key = after.split('?')[0]?.replace(/^\/+/, '')
  return key || null
}

function signCreativeImageUrl(imgUrl) {
  const key = extractS3KeyFromCloudFrontUrl(imgUrl)
  if (!key) return null
  try {
    return generateCloudFrontSignedUrl(key, AD_IMG_SIGNED_URL_EXPIRES_IN_SECONDS)
  } catch {
    return null
  }
}

function withSignedCreatives(adDoc) {
  if (!adDoc) return adDoc
  const ad = adDoc?.toObject ? adDoc.toObject() : { ...adDoc }
  if (!Array.isArray(ad.creatives)) return ad

  ad.creatives = ad.creatives.map((c) => {
    const creative = c?.toObject ? c.toObject() : { ...c }
    const signed = signCreativeImageUrl(creative.img)
    if (signed?.signedUrl) {
      creative.signedImg = signed.signedUrl
      creative.expiresAt = signed.expiresAt
      creative.expiresInSeconds = signed.expiresInSeconds
    }
    return creative
  })

  return ad
}

function withSignedCreativesArray(list) {
  if (!Array.isArray(list)) return list
  return list.map(withSignedCreatives)
}

const getAll = async (req, res) => {
  const authorizationHeader = req.headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  const userId = verifyToken(bearerToken)

  try {
    // Only expose approved + paid + non-deleted ads that aren't the viewer's
    // own — never unapproved/unpaid/soft-deleted rows.
    const result = await Advertisement.aggregate([
      {
        $match: {
          userId: { $ne: userId },
          isDeleted: { $ne: true },
          Approval: 'Approved',
          paymentStatus: 1,
        },
      },
      { $sample: { size: 2 } },
    ])
    return res
      .status(200)
      .json({
        success: true,
        message: 'Data retrieved',
        data: withSignedCreativesArray(result),
      })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error retrieving data' })
  }
}

const GetAllAdvertisements = async (req, res) => {
  const authorizationHeader = req.headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }

  const bearerToken = authorizationHeader.split(' ')[1]
  const userId = verifyToken(bearerToken)
  console.log(userId, 'id')
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit

  try {
    const user = await User.findOne({
      _id: userId,
      isDeleted: { $ne: true },
    }).select('role')
    if (!user || user?.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this.',
      })
    }

    // Get total count before pagination
    const total = await Advertisement.countDocuments()

    // Fetch paginated ads with projection
    const result = await Advertisement.aggregate([
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          budget: 1,
          createdAt: 1,
          paymentStatus: 1,
          status: 1,
          totalBudgetUsed: 1,
          Approval: 1,
          RejectedReason: 1,
          userId: 1,
          creatives: {
            $map: {
              input: '$creatives',
              as: 'creative',
              in: {
                img: '$$creative.img',
                adLink: '$$creative.adLink',
                format: '$$creative.format',
              },
            },
          },
        },
      },
    ])

    const totalPages = Math.ceil(total / limit)

    return res.status(200).json({
      success: true,
      advertisements: withSignedCreativesArray(result),
      pagination: {
        total,
        currentPage: page,
        totalPages,
        limit,
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: 'Error retrieving advertisements',
    })
  }
}

const GetOneAdvertisements = async (req, res) => {
  const authorizationHeader = req.headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  const userId = verifyToken(bearerToken)

  const id = req.params.id

  try {
    // validateMongoId(id)
    const user = await User.findOne({
      _id: userId,
      isDeleted: { $ne: true },
    }).select('role')

    if (!user || user?.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this.',
      })
    }

    const result = await Advertisement.aggregate([
      { $match: { _id: new Types.ObjectId(id) } },
      {
        $project: {
          budget: 1,
          createdAt: 1,
          paymentStatus: 1,
          status: 1,
          totalBudgetUsed: 1,
          Approval: 1,
          RejectedReason: 1,
          userId: 1,
          creatives: {
            $map: {
              input: '$creatives',
              as: 'creative',
              in: {
                img: '$$creative.img',
                adLink: '$$creative.adLink',
                format: '$$creative.format',
              },
            },
          },
        },
      },
    ])

    return res.status(200).json({
      success: true,
      advertisement: withSignedCreatives(result?.[0]),
    })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error retrieving data' })
  }
}

const getAllFooterBanners = async (req, res) => {
  const authorizationHeader = req.get('authorization')
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error('Authorization error: Bearer token not found')
    return res
      .status(401)
      .json({ error: 'Bearer token not found in Authorization header' })
  }

  const bearerToken = authorizationHeader.split(' ')[1]
  const userId = verifyToken(bearerToken)

  try {
    // Candidate ads must be approved, paid, not soft-deleted, and not the
    // viewer's own. (Payment/approval are the serving gates; without the paid
    // check an approved-but-unpaid ad would serve for free.)
    const candidates = await Advertisement.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          Approval: 'Approved',
          paymentStatus: 1,
          userId: { $ne: userId },
        },
      },
      { $unwind: '$creatives' },
      { $match: { 'creatives.format': 'Footer Banner' } },
      {
        $group: {
          _id: '$_id',
          creatives: { $push: '$creatives' },
          totalBudgetUsed: { $first: '$totalBudgetUsed' },
          budget: { $first: '$budget' },
          targetedAudience: { $first: '$targetedAudience' },
          userId: { $first: '$userId' },
          status: { $first: '$status' },
          paymentStatus: { $first: '$paymentStatus' },
          Approval: { $first: '$Approval' },
          createdAt: { $first: '$createdAt' },
        },
      },
    ])

    // Only serve ads inside their flight window and with budget remaining.
    // (Budget is click-only spend now; wallet top-ups don't exist yet, so
    // budget exhaustion is a hard stop — revisit if a top-up path is added.)
    const now = Date.now()
    const servable = candidates.filter((ad) => {
      const ta = ad.targetedAudience || {}
      const start = ta.startAt?.[0] ? new Date(ta.startAt[0]) : null
      const end = ta.endAt?.[0] ? new Date(ta.endAt[0]) : null
      if (start && !isNaN(start.getTime()) && now < start.getTime()) return false
      if (end && !isNaN(end.getTime())) {
        // endAt is inclusive of the whole end day.
        if (now >= end.getTime() + 24 * 60 * 60 * 1000) return false
      }
      const budget = Number(ad.budget)
      const used = Number(ad.totalBudgetUsed) || 0
      if (Number.isFinite(budget) && used >= budget) return false
      return true
    })

    const chosen = servable.length
      ? [servable[Math.floor(Math.random() * servable.length)]]
      : []

    return res
      .status(200)
      .json({
        success: true,
        message: 'Data retrieved',
        data: withSignedCreativesArray(chosen),
      })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error retrieving data' })
  }
}

const getById = async (req, res) => {
  const { id } = req.params
  const authorizationHeader = req.get('authorization')
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error('Authorization error: Bearer token not found')
    return res
      .status(401)
      .json({ error: 'Bearer token not found in Authorization header' })
  }

  const bearerToken = authorizationHeader.split(' ')[1]

  try {
    const requesterId = verifyToken(bearerToken)
    if (!requesterId || requesterId?.status === 401) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid or expired token' })
    }

    const result = await Advertisement.findOne({
      _id: id,
      isDeleted: { $ne: true },
    })

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: 'Advertisement not found' })
    }

    // Only the ad's owner or an Admin may view a specific advertisement.
    const requester = await User.findById(requesterId).select('role')
    const isOwner = result.userId?.toString() === String(requesterId)
    const isAdmin = requester?.role === 'Admin'
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view this advertisement',
      })
    }

    return res
      .status(200)
      .json({
        success: true,
        message: 'Data retrieved',
        data: withSignedCreatives(result),
      })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error retrieving data' })
  }
}

const getUserAdvertisements = async (req, res) => {
  const authorizationHeader = req.headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  try {
    const userIdFromToken = verifyToken(bearerToken)

    const result = await Advertisement.find({
      userId: userIdFromToken,
      isDeleted: false,
    })

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: 'Advertisements not found' })
    }
    return res
      .status(200)
      .json({
        success: true,
        message: 'Data retrieved',
        data: withSignedCreativesArray(result),
      })
  } catch (error) {
    console.error({ error: error?.message })
    return res
      .status(500)
      .json({ success: false, message: 'Error retrieving data' })
  }
}

const create = async (req, res) => {
  const { body, headers } = req
  // console.log(body, headers, 'headers')

  try {
    const authorizationHeader = headers['authorization']

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ error: 'Bearer token not found in Authorization header' })
    }
    const bearerToken = authorizationHeader.split(' ')[1]

    try {
      const tokenVerification = verifyToken(bearerToken)

      if (!tokenVerification) {
        return res
          .status(401)
          .json({ error: 'Bearer token not found in Authorization header' })
      }

      const userIdFromToken = tokenVerification

      // Whitelist: only advertiser-supplied fields are accepted. Approval,
      // paymentStatus, totalBudgetUsed and status are set by the server (and by
      // the payment/approval flows) — never by the client — so a crafted body
      // can't self-approve, mark itself paid, or pre-spend budget.
      const response = await Advertisement.create({
        creatives: Array.isArray(body?.creatives) ? body.creatives : [],
        targetedAudience: body?.targetedAudience,
        budget: body?.budget,
        email: body?.email,
        userId: userIdFromToken,
        // Server-forced safe defaults (also the schema defaults, set explicitly):
        Approval: 'Pending',
        paymentStatus: 0,
        totalBudgetUsed: 0,
        status: 'in_progress',
      })

      try {
        const NotificationData = {
          UserId: response?._id,
          userUUID: response?.uuid,
          UserRole: 'Admin',
          title: 'Advertisement',
          message: `New Advertisement added for approval.`,
          RelateRoute: 'advertisement',
          RelatedId: response?._id,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }

      if (response) {
        return res.status(201).json({
          message: 'Advertisement Created Successfully',
          data: response,
        })
      }
    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: 'Error creating advertisement' })
    }
  } catch (viewError) {
    if (viewError.name === 'ValidationError') {
      return res
        .status(401)
        .json({ error: 'Form validation error', details: viewError?.errors })
    } else {
      return res.status(500).json({ error: viewError?.message })
    }
  }
}

// Flat ad pricing, same for every format (same currency/units as `budget`).
// Click fee: 0.30 per click. Impression fee: 0.1 per 1000 impressions =
// 0.0001 per impression.
const CLICK_PRICE_AED = 0.3
const IMPRESSION_PRICE_AED = 0.1 / 1000

function getCurrentPrice() {
  return CLICK_PRICE_AED
}

function getImpressionPrice() {
  return IMPRESSION_PRICE_AED
}

const updatedClicks = async (req, res) => {
  const { body, headers } = req
  const authorizationHeader = headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  const userIdFromToken = verifyToken(bearerToken)

  try {
    const user = await User.findOne({
      _id: userIdFromToken,
      isDeleted: { $ne: true },
    })

    if (user) {
      const currentDate = new Date()
      const currentTime = currentDate.toLocaleTimeString('en-US', {
        hour12: false,
      })
      const userData = user
      const localization = await GetUserLocalization()
      const obj = {
        country: userData.country || localization?.country || '',
        cities: userData.city || localization?.city || '',
        states: userData.state || localization?.region || '',
        userId: userData._id || '', // needed for server-side click de-dup
        gender: userData.gender || '',
        time: currentTime,
        date: currentDate,
      }

      const advertisementFound = await Advertisement.findOne({
        _id: body.advertisementId,
        isDeleted: { $ne: true },
      })

      if (!advertisementFound) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' })
      }

      // Check if the user is the creator of the advertisement
      if (userIdFromToken === advertisementFound.userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'User cannot add click to their own advertisement',
        })
      }

      // Server-side de-dup: at most one billable click per user, per creative,
      // per 24h. The frontend localStorage guard is clearable, so this is the
      // real protection against draining an advertiser's budget with repeat
      // clicks. (Legacy clicks with no userId are ignored by the guard.)
      const clickWindowStart = currentDate.getTime() - 24 * 60 * 60 * 1000
      const alreadyClicked = (advertisementFound.creatives || []).some(
        (creative) =>
          String(creative._id) === String(body.creativeId) &&
          (creative.clicks || []).some(
            (click) =>
              click?.userId &&
              click.userId.toString() === userIdFromToken.toString() &&
              new Date(click.date).getTime() > clickWindowStart,
          ),
      )
      if (alreadyClicked) {
        return res.status(200).json({
          success: true,
          message:
            'Click already counted for this advertisement in the last 24 hours',
        })
      }

      const currentPrice = getCurrentPrice()
      const budget = Number(advertisementFound?.budget)
      const used = Number(advertisementFound?.totalBudgetUsed) || 0

      // Budget is a hard cap: prepaid per ad, no wallet/overage. Serving already
      // stops exhausted ads; this guards the boundary click (and any race) so we
      // never bill past the budget the advertiser paid for.
      if (Number.isFinite(budget) && used >= budget) {
        return res.status(200).json({
          success: true,
          message: 'Advertisement budget exhausted',
        })
      }

      // Atomic spend increment + click record — no read-then-write race, so
      // concurrent clicks each bill exactly once.
      const result = await Advertisement.findByIdAndUpdate(
        body.advertisementId,
        {
          $inc: { totalBudgetUsed: currentPrice },
          $push: { 'creatives.$[element].clicks': obj },
        },
        {
          arrayFilters: [{ 'element._id': body.creativeId }],
          new: true,
        },
      )

      if (result) {
        return res
          .status(200)
          .json({ success: true, message: 'Data updated', data: result })
      } else {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' })
      }
    } else {
      return res
        .status(404)
        .json({ success: false, message: "User doesn't have an account" })
    }
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error updating Advertisement' })
  }
}

// Impression pricing removed: under clicks-only pricing an impression is
// recorded for analytics but never charges the budget or wallet.

const updatedImpressions = async (req, res) => {
  const { body, headers } = req
  const authorizationHeader = headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }
  const bearerToken = authorizationHeader.split(' ')[1]
  const userIdFromToken = verifyToken(bearerToken)
  if (userIdFromToken.status === 401) {
    return res.status(401).json({
      success: false,
      message: 'Bearer is Expired please login again.',
    })
  }
  try {
    const user = await User.findOne({
      _id: userIdFromToken,
      isDeleted: { $ne: true },
    })

    if (user) {
      const currentDate = new Date()
      const currentTime = currentDate.toLocaleTimeString('en-US', {
        hour12: false,
      })
      const userData = user
      const localization = await GetUserLocalization()
      const obj = {
        country: userData.country || localization?.country || '',
        cities: userData.city || localization?.city || '',
        states: userData.state || localization?.region || '',
        userId: userData._id || '',
        gender: userData.gender || '',
        age: userData.age || null,
        time: currentTime,
        date: currentDate,
      }

      const advertisementFound = await Advertisement.findOne({
        _id: body?.advertisementId,
        isDeleted: { $ne: true },
      })

      if (!advertisementFound) {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' })
      }

      // Check if the user is the creator of the advertisement
      if (userIdFromToken === advertisementFound?.userId?.toString()) {
        return res.status(403).json({
          success: false,
          message: 'User cannot add impression to their own advertisement',
        })
      }

      // Check if userId is already present in the advertisement's impressions within the last 24 hours
      const isUserIdPresent = (advertisementFound.creatives || []).some(
        (creative) =>
          (creative.impressions || []).some(
            (impression) =>
              impression?.userId &&
              impression.userId.toString() === userIdFromToken.toString() &&
              new Date(impression.date).getTime() >
                currentDate.getTime() - 24 * 60 * 60 * 1000,
          ),
      )

      if (isUserIdPresent) {
        return res.status(400).json({
          success: false,
          message:
            'User has already viewed this advertisement within the last 24 hours',
        })
      }

      // Impression fee: 0.1 per 1000 impressions. Budget is a hard cap (no
      // wallet) — stop billing once the prepaid budget is spent; serving already
      // excludes exhausted ads, so this only guards the boundary/races.
      const impressionPrice = getImpressionPrice()
      const budget = Number(advertisementFound?.budget)
      const used = Number(advertisementFound?.totalBudgetUsed) || 0
      if (Number.isFinite(budget) && used >= budget) {
        return res.status(200).json({
          success: true,
          message: 'Advertisement budget exhausted',
        })
      }

      // Atomic spend increment + impression record — no read-then-write race.
      const result = await Advertisement.findByIdAndUpdate(
        body.advertisementId,
        {
          $inc: { totalBudgetUsed: impressionPrice },
          $push: { 'creatives.$[element].impressions': obj },
        },
        {
          arrayFilters: [{ 'element._id': body.creativeId }],
          new: true,
        },
      )

      if (result) {
        return res
          .status(200)
          .json({ success: true, message: 'Data updated', data: result })
      } else {
        return res
          .status(404)
          .json({ success: false, message: 'Advertisement not found' })
      }
    } else {
      return res
        .status(404)
        .json({ success: false, message: "User doesn't have an account" })
    }
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error updating Advertisement' })
  }
}

const update = async (req, res) => {
  const { body, headers } = req
  const { id } = req.params
  const authorizationHeader = headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ message: 'Bearer token not found in Authorization header' })
  }
  const bearerToken = authorizationHeader.split(' ')[1]

  try {
    const tokenVerification = verifyToken(bearerToken)

    if (!tokenVerification) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid token, try to login' })
    }

    const userIdFromToken = tokenVerification
    const user = await User.findOne({
      _id: userIdFromToken,
      isDeleted: { $ne: true },
    }).select('role')

    if (!user) return res.status(401).json({ message: 'User not found' })

    const advertisement = await Advertisement.findOne({
      _id: id,
      isDeleted: { $ne: true },
    })
    if (!advertisement)
      return res.status(404).json({ message: 'Advertisement not found' })

    const isOwner = String(advertisement.userId) === String(userIdFromToken)
    const isAdmin = user.role === 'Admin'

    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: 'Unauthorized user' })

    // Field-level whitelist. Owners may only edit their creative + targeting;
    // admins may only set approval state. Nobody sets paymentStatus, status,
    // budget or totalBudgetUsed here — payment is confirmed server-side
    // (payment-confirm endpoint / Stripe webhook) and spend is billed by the
    // click handler. This closes the self-approve / self-mark-paid / self-credit
    // holes.
    const OWNER_FIELDS = ['creatives', 'targetedAudience']
    const ADMIN_FIELDS = ['Approval', 'RejectedReason']
    const allowedFields = [
      ...(isOwner ? OWNER_FIELDS : []),
      ...(isAdmin ? ADMIN_FIELDS : []),
    ]

    const updateDoc = {}
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
        updateDoc[key] = body[key]
      }
    }

    if (Object.keys(updateDoc).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'No updatable fields provided' })
    }

    const updatedAdvertisement = await Advertisement.findByIdAndUpdate(
      id,
      { $set: updateDoc },
      { new: true },
    )

    if (updatedAdvertisement) {
      try {
        const NotificationData = {
          userId: updatedAdvertisement?.userId,
          userUUID: updatedAdvertisement?.uuid,
          UserRole: 'DealHunter',
          title: 'Advertisement',
          message: `New Advertisement added for approval.`,
          RelateRoute: 'advertisement',
          RelatedId: updatedAdvertisement?._id,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }
      return res.status(200).json({
        success: true,
        message: 'Data updated',
        data: updatedAdvertisement,
      })
    } else {
      return res
        .status(500)
        .json({ success: false, message: 'Error updating Advertisement' })
    }
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error updating Advertisement' })
  }
}

// Server-to-server payment confirmation. Called by the Stripe webhook and the
// checkout-return handler AFTER Stripe itself has confirmed the charge — never
// by the browser or advertiser. Trust comes from a shared internal secret, so
// paymentStatus can't be forged by a client (the general update endpoint no
// longer accepts paymentStatus at all).
const markAdvertisementPaid = async (req, res) => {
  const provided = req.headers['x-internal-secret']
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected || provided !== expected) {
    return res.status(403).json({ success: false, message: 'Forbidden' })
  }

  const { id } = req.params
  // Stripe payment_intent captured at confirm time so the ad can be refunded to
  // the original card on deletion (no wallet).
  const paymentIntentId =
    typeof req.body?.paymentIntentId === 'string'
      ? req.body.paymentIntentId
      : undefined
  try {
    const update = { paymentStatus: 1, status: 'completed' }
    if (paymentIntentId) update.stripePaymentIntentId = paymentIntentId
    const ad = await Advertisement.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: update },
      { new: true },
    )
    if (!ad) {
      return res
        .status(404)
        .json({ success: false, message: 'Advertisement not found' })
    }
    return res.status(200).json({
      success: true,
      message: 'Payment confirmed',
      data: { _id: ad._id, paymentStatus: ad.paymentStatus },
    })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error confirming payment' })
  }
}

const deleteAdvertisement = async (req, res) => {
  const { id } = req.params
  const { creativeId } = req.query
  const { headers } = req

  const authorizationHeader = headers['authorization']
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Bearer token not found in Authorization header',
    })
  }

  const bearerToken = authorizationHeader.split(' ')[1]

  try {
    const tokenVerification = verifyToken(bearerToken)
    const userIdFromToken = tokenVerification

    const findAdvertisement = await Advertisement.findOne({
      _id: id,
      userId: userIdFromToken,
      isDeleted: false, // Only fetch active ads
    })

    if (!findAdvertisement) {
      return res.status(404).json({
        success: false,
        message: 'Advertisement not found or already deleted',
      })
    }

    // Case 1: Remove a creative if more than 1 exists
    if (findAdvertisement.creatives.length > 1 && creativeId) {
      const creativeIdString = creativeId.toString()

      const newArray = findAdvertisement.creatives.filter(
        (creative) => creative._id.toString() !== creativeIdString,
      )

      if (newArray.length === findAdvertisement.creatives.length) {
        return res
          .status(404)
          .json({ success: false, message: 'Creative not found' })
      }

      findAdvertisement.creatives = newArray
      await findAdvertisement.save()

      return res.status(200).json({
        success: true,
        message: 'Creative deleted successfully',
        data: findAdvertisement,
      })
    }

    // Case 2: Soft delete the whole advertisement if only 1 creative remains
    findAdvertisement.isDeleted = true
    findAdvertisement.deletedAt = new Date()
    await findAdvertisement.save()

    // Refund unspent budget to the original card via Stripe (no wallet). Refund
    // = budget - spend, capped at >= 0. Skipped when there's no captured payment
    // (e.g. a 100%-off promo checkout completes with no payment_intent).
    if (
      findAdvertisement.paymentStatus === 1 &&
      findAdvertisement.stripePaymentIntentId &&
      !findAdvertisement.refundId
    ) {
      const refundAmount =
        Number(findAdvertisement.budget) -
        Number(findAdvertisement.totalBudgetUsed || 0)
      const refundFils = Math.round(refundAmount * 100)

      if (refundFils > 0) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: findAdvertisement.stripePaymentIntentId,
            amount: refundFils,
          })
          findAdvertisement.refundId = refund.id
          findAdvertisement.refundedAt = new Date()
          await findAdvertisement.save()
        } catch (refundErr) {
          // Don't fail the delete on a refund error — the ad is already
          // soft-deleted. Log so it can be reconciled/refunded manually.
          console.error(
            'Advertisement refund failed for',
            findAdvertisement._id?.toString(),
            refundErr?.message,
          )
        }
      }
    }

    // Send notification
    try {
      const NotificationData = {
        userId: findAdvertisement.userId,
        userUUID: findAdvertisement?.uuid,
        UserRole: 'DealHunter',
        title: 'Advertisement',
        message: `Your advertisement has been deleted.`,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({
      success: true,
      message: 'Advertisement soft-deleted successfully',
      data: findAdvertisement,
    })
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ success: false, message: 'Error deleting data' })
  }
}

const getByUserId = async (req, res) => {
  const { userId } = req.params

  try {
    const authorizationHeader =
      req.headers['authorization'] || req.get('authorization')

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Bearer token not found in Authorization header',
      })
    }

    const bearerToken = authorizationHeader.split(' ')[1]
    const requesterId = verifyToken(bearerToken)

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      })
    }

    const requester = await User.findById(requesterId, {
      isDeleted: false,
    }).select('role')

    if (!requester) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      })
    }

    // Admin can request any user's advertisements; others can only fetch their own.
    if (
      requester.role !== 'Admin' &&
      userId &&
      userId !== String(requesterId)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Cannot access advertisements of another user',
      })
    }

    const targetUserId = userId || String(requesterId)

    const advertisements = await Advertisement.find({
      userId: targetUserId,
      isDeleted: false,
    })

    return res.status(200).json({
      success: true,
      message: 'Advertisements fetched successfully',
      data: withSignedCreativesArray(advertisements),
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    })
  }
}

export {
  getAll,
  getAllFooterBanners,
  getById,
  getUserAdvertisements,
  create,
  updatedClicks,
  updatedImpressions,
  update,
  markAdvertisementPaid,
  deleteAdvertisement,
  getByUserId,
  GetAllAdvertisements,
  GetOneAdvertisements,
}
