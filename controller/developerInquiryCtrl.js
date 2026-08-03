import asyncHandler from 'express-async-handler'
import DeveloperInquiry, {
  INQUIRY_TYPES,
  INQUIRY_STATUSES,
} from '../models/developerInquiryModel.js'
import DeveloperUnit from '../models/developerUnitModel.js'
import Property from '../models/propertyModel.js'
import User from '../models/userModel.js'
import { sanitizeMongoId } from '../utils/nosqlSanitizer.js'
import { assertApprovedDeveloper } from '../utils/developerProjectAccess.js'
import { syncPublishedPropertyFromUnit } from '../utils/syncPublishedUnitProperty.js'
import { createNotification } from './notifications.controller.js'
import sendEmail from '../utils/nodeMailer.js'

const getDeveloperPortalBase = () =>
  String(process.env.DEVELOPER_PORTAL_URL || 'http://localhost:3012').replace(
    /\/$/,
    '',
  )

const findPropertyByParam = async (idOrUuid) => {
  const query = { isDeleted: { $ne: true } }
  const mongoId = sanitizeMongoId(idOrUuid)
  if (mongoId) query._id = mongoId
  else query.uuid = String(idOrUuid || '').trim()
  if (!query._id && !query.uuid) return null
  return Property.findOne(query)
}

const notifyDeveloperInquiry = async ({
  developer,
  title,
  message,
  emailSubject,
  emailHtml,
}) => {
  if (!developer?._id) return
  try {
    await createNotification({
      data: {
        userId: developer._id,
        userUUID: developer.uuid,
        UserRole: 'Developer',
        title,
        message,
        RelateRoute: '/dashboard/crm',
      },
    })
  } catch (err) {
    console.warn('Developer inquiry notification failed:', err?.message || err)
  }

  if (developer.email && emailSubject && emailHtml) {
    sendEmail({
      to: developer.email,
      subject: emailSubject,
      html: emailHtml,
    }).then((result) => {
      if (!result.success) {
        console.warn(`Developer inquiry email failed: ${result.error}`)
      }
    })
  }
}

/**
 * Buyer: submit POF interest / offer / reservation on a published off-plan listing.
 * POST /property/:id/developer-inquiry
 */
export const createDeveloperInquiry = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ success: false, message: 'Login required' })
  }

  const type = String(req.body?.type || '').trim().toLowerCase()
  if (!INQUIRY_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      message: `type must be one of: ${INQUIRY_TYPES.join(', ')}`,
    })
  }

  const property = await findPropertyByParam(req.params.id)
  if (!property) {
    return res.status(404).json({ success: false, message: 'Listing not found' })
  }

  if (Number(property.status) !== 1) {
    return res.status(400).json({
      success: false,
      message: 'This listing is not available for new requests',
    })
  }

  if (String(property.occupancyStatus || '') === 'Sold') {
    return res.status(400).json({
      success: false,
      message: 'This unit has been sold',
    })
  }

  const buyer = await User.findById(req.user._id)
  if (!buyer || buyer.isDeleted) {
    return res.status(401).json({ success: false, message: 'Login required' })
  }

  if (String(property.userId) === String(buyer._id)) {
    return res.status(400).json({
      success: false,
      message: 'You cannot inquire on your own listing',
    })
  }

  const developer = await User.findById(property.userId)
  if (!developer) {
    return res.status(404).json({ success: false, message: 'Developer not found' })
  }

  const listingPrice = Number(property.price || property.priceFrom || 0)
  const pofAmount = Number(buyer.financialInfo?.fundsVerification)
  const pofStatus = String(buyer.financialInfo?.status || 'Pending')
  const pofApproved =
    pofStatus === 'Approved' && Number.isFinite(pofAmount) && pofAmount > 0

  if (type === 'pof') {
    if (!pofApproved) {
      return res.status(400).json({
        success: false,
        message:
          'Submit and get your Proof of Funds approved in your profile before continuing',
        code: 'POF_REQUIRED',
        redirect: '/profile',
      })
    }
    if (listingPrice > 0 && pofAmount < listingPrice) {
      return res.status(400).json({
        success: false,
        message: `Verified funds (AED ${pofAmount.toLocaleString()}) are below listing price (AED ${listingPrice.toLocaleString()})`,
        code: 'POF_INSUFFICIENT',
        redirect: '/profile',
      })
    }
  }

  if (type === 'offer' || type === 'reserve') {
    if (!pofApproved) {
      return res.status(400).json({
        success: false,
        message:
          'Approved Proof of Funds is required before making an offer or reservation',
        code: 'POF_REQUIRED',
        redirect: '/profile',
      })
    }
  }

  let offerAmount = null
  if (type === 'offer') {
    offerAmount = Number(req.body?.offerAmount)
    if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid offer amount is required',
      })
    }
  }

  if (type === 'reserve') {
    offerAmount = listingPrice > 0 ? listingPrice : null
  }

  const unit = await DeveloperUnit.findOne({
    publishedPropertyId: property._id,
    isDeleted: false,
  })

  const inquiry = await DeveloperInquiry.create({
    type,
    property: property._id,
    propertyUuid: property.uuid,
    developer: developer._id,
    buyer: buyer._id,
    developerUnit: unit?._id || null,
    offerAmount,
    currency: String(req.body?.currency || property.currency || 'AED').trim() || 'AED',
    message: String(req.body?.message || '').trim().slice(0, 2000),
    pofAmount: Number.isFinite(pofAmount) ? pofAmount : null,
    pofStatus,
    listingTitle: property.title || '',
    listingSlug: property.slug || property.uuid || '',
  })

  const typeLabel =
    type === 'pof'
      ? 'Proof of Funds interest'
      : type === 'offer'
        ? 'Offer'
        : 'Reservation request'

  const portalBase = getDeveloperPortalBase()
  await notifyDeveloperInquiry({
    developer,
    title: `${typeLabel} received`,
    message: `${buyer.name || 'A buyer'} submitted a ${typeLabel.toLowerCase()} on “${property.title}”.`,
    emailSubject: `Funds Verifier — ${typeLabel}`,
    emailHtml: `
      <h2>${typeLabel}</h2>
      <p>Hello ${developer.name || 'Developer'},</p>
      <p><strong>${buyer.name || 'Buyer'}</strong> (${buyer.email || 'n/a'}) submitted a ${typeLabel.toLowerCase()} on <strong>${property.title}</strong>.</p>
      ${offerAmount != null ? `<p>Amount: ${inquiry.currency} ${Number(offerAmount).toLocaleString()}</p>` : ''}
      ${inquiry.message ? `<p>Message: ${inquiry.message}</p>` : ''}
      <p><a href="${portalBase}/dashboard/crm">Open CRM & Analytics</a></p>
    `,
  })

  return res.status(201).json({
    success: true,
    message: `${typeLabel} submitted`,
    inquiry: {
      uuid: inquiry.uuid,
      type: inquiry.type,
      status: inquiry.status,
      offerAmount: inquiry.offerAmount,
    },
  })
})

/**
 * Developer: list CRM inquiries (offers / reserves / POF).
 * GET /developer-projects/inquiries
 */
export const listDeveloperInquiries = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const status = String(req.query?.status || '').trim()
  const type = String(req.query?.type || '').trim().toLowerCase()

  const filter = {
    developer: user._id,
    isDeleted: false,
  }
  if (status && INQUIRY_STATUSES.includes(status)) filter.status = status
  if (type && INQUIRY_TYPES.includes(type)) filter.type = type

  const inquiries = await DeveloperInquiry.find(filter)
    .populate({ path: 'buyer', select: 'name email phone uuid financialInfo' })
    .populate({ path: 'property', select: 'uuid title slug price occupancyStatus' })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()

  return res.status(200).json({
    success: true,
    inquiries: inquiries.map((row) => ({
      id: row._id,
      uuid: row.uuid,
      type: row.type,
      status: row.status,
      offerAmount: row.offerAmount,
      currency: row.currency,
      message: row.message,
      pofAmount: row.pofAmount,
      pofStatus: row.pofStatus,
      listingTitle: row.listingTitle || row.property?.title,
      listingSlug: row.listingSlug || row.property?.slug,
      propertyUuid: row.propertyUuid || row.property?.uuid,
      buyer: {
        name: row.buyer?.name,
        email: row.buyer?.email,
        phone: row.buyer?.phone,
        uuid: row.buyer?.uuid,
      },
      createdAt: row.createdAt,
      developerNote: row.developerNote,
    })),
  })
})

/**
 * Developer: accept / decline an inquiry.
 * When accepting a reserve, mark linked unit Reserved and sync Property.
 * PATCH /developer-projects/inquiries/:id/status
 */
export const updateDeveloperInquiryStatus = asyncHandler(async (req, res) => {
  const user = await assertApprovedDeveloper(req, res)
  const nextStatus = String(req.body?.status || '').trim()
  if (!['Accepted', 'Declined'].includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message: 'status must be Accepted or Declined',
    })
  }

  const query = { developer: user._id, isDeleted: false }
  const mongoId = sanitizeMongoId(req.params.id)
  if (mongoId) query._id = mongoId
  else query.uuid = String(req.params.id || '').trim()

  const inquiry = await DeveloperInquiry.findOne(query)
  if (!inquiry) {
    return res.status(404).json({ success: false, message: 'Inquiry not found' })
  }

  inquiry.status = nextStatus
  inquiry.respondedAt = new Date()
  inquiry.developerNote = String(req.body?.note || '').trim().slice(0, 1000)
  await inquiry.save()

  if (nextStatus === 'Accepted' && inquiry.type === 'reserve' && inquiry.developerUnit) {
    const unit = await DeveloperUnit.findOne({
      _id: inquiry.developerUnit,
      developer: user._id,
      isDeleted: false,
    })
    if (unit && unit.status !== 'Sold') {
      unit.status = 'Reserved'
      await unit.save()
      await syncPublishedPropertyFromUnit(unit)
    }
  }

  if (nextStatus === 'Accepted' && inquiry.type === 'offer' && inquiry.developerUnit) {
    const unit = await DeveloperUnit.findOne({
      _id: inquiry.developerUnit,
      developer: user._id,
      isDeleted: false,
    })
    if (unit && !['Sold', 'Reserved'].includes(unit.status)) {
      unit.status = 'Under Offer'
      await unit.save()
      await syncPublishedPropertyFromUnit(unit)
    }
  }

  return res.status(200).json({
    success: true,
    message: `Inquiry ${nextStatus.toLowerCase()}`,
    inquiry,
  })
})
