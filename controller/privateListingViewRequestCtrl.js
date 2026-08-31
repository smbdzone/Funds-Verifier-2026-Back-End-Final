import asyncHandler from 'express-async-handler'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import User from '../models/userModel.js'
import PrivateListingViewRequest from '../models/privateListingViewRequestModel.js'
import { sanitizeEmail, sanitizeMongoId, sanitizeUUID } from '../utils/nosqlSanitizer.js'
import { isPrivateListing } from '../utils/listingVisibility.js'
import { sendPrivateListingRequestEmails } from '../utils/privateListingRequestMail.js'
import { createNotification } from './notifications.controller.js'
import { clean } from './emailCtrl.js'

const LISTING_MODELS = [
  ['Property', Property],
  ['Car', Car],
  ['Boat', Boat],
  ['Jewelry', Jewelry],
]

const findMarketplaceListing = async (rawId) => {
  const id = String(rawId || '').trim()
  if (!id) return null

  const mongoId = sanitizeMongoId(id)
  const uuid = sanitizeUUID(id)

  for (const [listingModel, Model] of LISTING_MODELS) {
    const query = { isDeleted: { $ne: true } }
    if (mongoId) query._id = mongoId
    else if (uuid) query.uuid = uuid
    else query.slug = id

    const listing = await Model.findOne(query)
    if (listing) return { listing, listingModel }
  }

  return null
}

const normalizePhone = (value) =>
  String(value || '')
    .trim()
    .replace(/[^\d+\s()-]/g, '')
    .slice(0, 30)

export const createPrivateListingViewRequest = asyncHandler(async (req, res) => {
  const name = clean(String(req.body?.name || req.body?.fullName || '').trim())
  const email = sanitizeEmail(req.body?.email)
  const phone = normalizePhone(req.body?.phone || req.body?.phoneNumber)
  const listingId = String(
    req.body?.listingUuid || req.body?.listingId || req.body?.uuid || '',
  ).trim()

  if (!name || name.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Please enter your name',
    })
  }
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email',
    })
  }
  const digitCount = phone.replace(/\D/g, '').length
  if (digitCount < 7) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid phone number',
    })
  }
  if (!listingId) {
    return res.status(400).json({
      success: false,
      message: 'Listing is required',
    })
  }

  const found = await findMarketplaceListing(listingId)
  if (!found) {
    return res.status(404).json({
      success: false,
      message: 'Listing not found',
    })
  }

  const { listing, listingModel } = found
  if (Number(listing.status) !== 1) {
    return res.status(400).json({
      success: false,
      message: 'This listing is not available',
    })
  }
  if (!isPrivateListing(listing)) {
    return res.status(400).json({
      success: false,
      message: 'This listing is public',
    })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await PrivateListingViewRequest.findOne({
    email,
    listingUuid: listing.uuid,
    isDeleted: false,
    createdAt: { $gte: since },
  })
  if (existing) {
    return res.status(200).json({
      success: true,
      message: 'We already received your request and will be in touch.',
    })
  }

  const sellerQuery = {
    isDeleted: false,
    $or: [
      listing.userUUID ? { uuid: listing.userUUID } : null,
      listing.userId ? { _id: listing.userId } : null,
    ].filter(Boolean),
  }
  const seller = sellerQuery.$or.length
    ? await User.findOne(sellerQuery, { email: 1, name: 1, uuid: 1, role: 1 })
    : null

  const request = await PrivateListingViewRequest.create({
    name,
    email,
    phone,
    listingUuid: listing.uuid,
    listingSlug: listing.slug || '',
    listingTitle: listing.title || '',
    assetType: listing.assetType || '',
    listingModel,
    listingRef: listing._id,
    sellerUUID: seller?.uuid || listing.userUUID || '',
    sellerEmail: seller?.email || '',
    sellerName: seller?.name || '',
  })

  sendPrivateListingRequestEmails({
    listing,
    seller,
    buyer: { name, email, phone },
    assetType: listing.assetType,
  }).catch((err) => {
    console.warn('Private listing request email failed:', err?.message || err)
  })

  if (seller?._id) {
    try {
      await createNotification({
        data: {
          userId: seller._id,
          userUUID: seller.uuid,
          UserRole: seller.role || 'AssetHolder',
          title: 'Buyer interested in your private listing',
          message: `${name} requested to view “${listing.title || 'your listing'}”.`,
          RelateRoute: '/seller-profile/my-listing',
          RelatedUUID: listing.uuid,
        },
      })
    } catch (err) {
      console.warn('Private listing request notification failed:', err?.message || err)
    }
  }

  return res.status(201).json({
    success: true,
    message: 'We have received your request and will be in touch.',
    requestId: request.uuid,
  })
})
