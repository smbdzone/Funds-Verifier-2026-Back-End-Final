import Advertisement from '../models/advertisement.js'
import { verifyToken } from '../middlewares/JwtAuth.js'
import User from '../models/userModel.js'
import { createNotification } from '../controller/notifications.controller.js'
import { GetUserLocalization } from '../utils/localization/GetUserLocalization.js'
import { Types } from 'mongoose'
import validateMongoId from '../utils/validateMongodbId.js'
import AdsWallet from '../models/AdsWalletModel.js'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'

const AD_IMG_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour

// Map a date of birth to one of the targeting age buckets (derived live, so it
// stays correct as the person ages). Returns '' when unknown / under 21.
function ageGroupFromDob(dob) {
  if (!dob) return ''
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  if (age >= 21 && age <= 30) return '21-30'
  if (age >= 31 && age <= 40) return '31-40'
  if (age >= 41 && age <= 50) return '41-50'
  if (age >= 51 && age <= 60) return '51-60'
  if (age > 60) return '60+'
  return ''
}

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
    const result = await Advertisement.aggregate([
      { $match: { userId: { $ne: userId } } },
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
    const user = await User.findById(userId, { isDeleted: false }).select(
      'role',
    )
    console.log(user, 'dsfghjkl;kjhgfdsfghj')

    // if (!user || user?.role !== 'Admin') {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'You are not authorized to access this.',
    //   })
    // }

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
    const user = await User.findById(userId, { isDeleted: false }).select(
      'role',
    )

    if (!user || user?.role !== 'Admin') {
      return res
        .status(400)
        .json({ message: 'You are not admin to access this.' })
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

// --------------------------------
const getAllSideBanners = async (req, res) => {
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
    const result = await Advertisement.aggregate([
      {
        $match: { userId: { $ne: userId } },
      },
      {
        $unwind: '$creatives',
      },
      {
        $match: { Approval: 'Approved', 'creatives.format': 'Side Banner' },
      },
      {
        $group: {
          _id: '$_id',
          creatives: { $push: '$creatives' },
          totalBudgetUsed: { $first: '$totalBudgetUsed' },
          budget: { $first: '$budget' },
          targetedAudience: { $first: '$targetedAudience' },
          Approval: { $first: '$Approval' },
          userId: { $first: '$userId' },
          status: { $first: '$status' },
          paymentStatus: { $first: '$paymentStatus' },
          createdAt: { $first: '$createdAt' },
        },
      },
      {
        $sample: { size: 1 },
      },
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

const getAllLargeBanners = async (req, res) => {
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
    // Viewer attributes for strict targeting (from UAE Pass / onboarding).
    // Age-group is derived live from date of birth so it never goes stale.
    const viewer = await User.findById(userId).select('city gender dateOfBirth')
    const viewerCity = (viewer?.city || '').toString().trim()
    const viewerGender = (viewer?.gender || '').toString().trim().toLowerCase()
    const viewerAge = ageGroupFromDob(viewer?.dateOfBirth)

    // Candidate approved Quarter-Page ads (excluding the viewer's own).
    const candidates = await Advertisement.aggregate([
      { $match: { userId: { $ne: userId }, isDeleted: { $ne: true } } },
      { $unwind: '$creatives' },
      {
        $match: {
          Approval: 'Approved',
          'creatives.format': 'Quarter-Page Banner',
        },
      },
      {
        $group: {
          _id: '$_id',
          creatives: { $push: '$creatives' },
          totalBudgetUsed: { $first: '$totalBudgetUsed' },
          budget: { $first: '$budget' },
          targetedAudience: { $first: '$targetedAudience' },
          Approval: { $first: '$Approval' },
          userId: { $first: '$userId' },
          status: { $first: '$status' },
          paymentStatus: { $first: '$paymentStatus' },
          createdAt: { $first: '$createdAt' },
        },
      },
    ])

    // Strict targeting: the viewer must match every dimension an ad constrains.
    // An unconstrained dimension (empty / 'all') is open; unknown viewer attribute = no match.
    const matches = candidates.filter((ad) => {
      const ta = ad.targetedAudience || {}

      const cities = (Array.isArray(ta.city) ? ta.city : [])
        .flat(Infinity)
        .filter(Boolean)
        .map((c) => c.toString().trim())
      if (cities.length > 0) {
        if (!viewerCity || !cities.includes(viewerCity)) return false
      }

      const adGender = (ta.gender || '').toString().trim().toLowerCase()
      if (adGender && adGender !== 'all') {
        if (!viewerGender || viewerGender !== adGender) return false
      }

      const adAge = (ta.ageGroup || '').toString().trim()
      if (adAge) {
        if (!viewerAge || viewerAge !== adAge) return false
      }

      return true
    })

    const chosen = matches.length
      ? [matches[Math.floor(Math.random() * matches.length)]]
      : []

    return res.status(200).json({
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
    const result = await Advertisement.aggregate([
      { $unwind: '$creatives' },
      { $match: { Approval: 'Approved', 'creatives.format': 'Footer Banner' } },
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
      { $sample: { size: 1 } },
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

    const result = await Advertisement.findById(id, { isDeleted: false })

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

const getByDateAndTime = async (req, res) => {
  try {
    const currentDate = new Date()
    const currentDayOfWeek = currentDate.toLocaleDateString('en-US', {
      weekday: 'short',
    })
    const currentTime = currentDate.toLocaleTimeString('en-US', {
      hour12: false,
    })

    const slots = ['08:00–14:00', '14:00–20:00', '20:00–02:00', '02:00–08:00']

    let selectedSlot = null

    // Check if the current time falls within any of the slots
    for (const slot of slots) {
      const [start, end] = slot.split('–')
      if (currentTime >= start && currentTime < end) {
        selectedSlot = slot
        break
      }
    }

    const advertisements = await Advertisement.find({
      $nor: [
        { 'targetedAudience.unwantedDays': { $in: [currentDayOfWeek] } },
        { 'targetedAudience.unwantedTimeSlots': { $in: [selectedSlot] } },
      ],
      isDeleted: false,
    })

    return res
      .status(200)
      .json({
        success: true,
        message: 'Data retrieved',
        data: withSignedCreativesArray(advertisements),
      })
  } catch (error) {
    console.error(error)
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

      const response = await Advertisement.create({
        ...body,
        userId: userIdFromToken,
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

function getCurrentPrice() {
  // Flat click fee: $0.3 per click
  return 0.3
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
    const user = await User.findById({ _id: userIdFromToken, isDeleted: false })

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
        time: currentTime,
        date: currentDate,
      }

      const advertisementFound = await Advertisement.findById(
        body.advertisementId,
        { isDeleted: false },
      )

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
      const currentPrice = getCurrentPrice()

      if (
        Number(advertisementFound?.totalBudgetUsed) >=
        Number(advertisementFound?.budget)
      ) {
        const wallet = await AdsWallet.findOne({
          userId: advertisementFound.userId,
          isDeleted: false,
        })
        if (!wallet || wallet.total <= 0) {
          return res.status(403).json({
            success: false,
            message:
              'Advertisement budget exhausted and no balance left in wallet.',
          })
        } else {
          wallet.total = wallet.total - currentPrice
          await wallet.save()
        }
      }

      const result = await Advertisement.findByIdAndUpdate(
        body.advertisementId,

        {
          $set: {
            totalBudgetUsed: advertisementFound.totalBudgetUsed + currentPrice,
          },
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

function getCurrentPriceForImpression() {
  // Flat impression fee: $0.1 per 1000 impressions = $0.0001 per impression
  return 0.0001
}

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
    const user = await User.findById({ _id: userIdFromToken, isDeleted: false })

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

      const advertisementFound = await Advertisement.findById(
        body?.advertisementId,
        { isDeleted: false },
      )

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

      // Flat impression fee: $0.1 per 1000 impressions = $0.0001 per impression
      const currentPriceForImpression = getCurrentPriceForImpression()
      const amountToAdd = 0

      if (
        Number(advertisementFound?.totalBudgetUsed) >=
        Number(advertisementFound?.budget)
      ) {
        const wallet = await AdsWallet.findOne({
          userId: advertisementFound?.userId,
          isDeleted: false,
        })
        if (!wallet || wallet.total <= 0) {
          return res.status(403).json({
            success: false,
            message:
              'Advertisement budget exhausted and no balance left in wallet.',
          })
        } else {
          wallet.total =
            wallet.total - (amountToAdd + currentPriceForImpression)
          await wallet.save()
        }
      }

      const result = await Advertisement.findByIdAndUpdate(
        body.advertisementId,
        {
          $set: {
            totalBudgetUsed:
              advertisementFound.totalBudgetUsed +
              amountToAdd +
              currentPriceForImpression,
          },
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
    const user = await User.findById(userIdFromToken, {
      isDeleted: false,
    }).select('role')

    if (!user) return res.status(401).json({ message: 'User not found' })

    const advertisement = await Advertisement.findById(id, { isDeleted: false })
    if (!advertisement)
      return res.status(404).json({ message: 'Advertisement not found' })

    const isOwner = userIdFromToken === advertisement.userId
    const isAdmin = user.role === 'Admin'

    if (isOwner && body?.Approval) delete body?.Approval
    if (isOwner && body?.RejectedReason) delete body?.RejectedReason

    if (!isOwner && !isAdmin)
      return res.status(403).json({ message: 'Unauthorized user' })

    // Update only the specified fields in the body
    const updatedAdvertisement = await Advertisement.findByIdAndUpdate(
      id,
      { $set: body },
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

    // Refund to wallet if paymentStatus == 1
    if (findAdvertisement.paymentStatus === 1) {
      const wallet = await AdsWallet.findOne({
        userId: findAdvertisement.userId,
        isDeleted: false,
      })
      const refundAmount =
        Number(findAdvertisement.budget) - findAdvertisement.totalBudgetUsed

      if (!wallet) {
        await AdsWallet.create({
          userId: userIdFromToken,
          total: refundAmount,
        })
      } else {
        wallet.total += refundAmount
        await wallet.save()
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
  getAllSideBanners,
  getAllLargeBanners,
  getAllFooterBanners,
  getById,
  getUserAdvertisements,
  getByDateAndTime,
  create,
  updatedClicks,
  updatedImpressions,
  update,
  deleteAdvertisement,
  getByUserId,
  GetAllAdvertisements,
  GetOneAdvertisements,
}
