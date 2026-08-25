import User from '../models/userModel.js'
import Request3D from '../models/request3DModel.js'
import ReportTechnical from '../models/reportModel.js'
import { stripe } from '../libs/stripe.js'
import Transaction from '../models/transactionModel.js'
import validateMongoId from '../utils/validateMongodbId.js'
import Property from '../models/propertyModel.js'
import Cars from '../models/carModel.js'
import Boats from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import { createNotification } from './notifications.controller.js'
import { sanitizeUUID } from '../utils/nosqlSanitizer.js'
import {
  linkTechnicalReportToListing,
  linkWalkthroughToListing,
  clearUnpaidPremiumOnListing,
  loadPaidPremiumRecord,
  premiumBookingFieldsFromInput,
  applyPremiumBookingFields,
  isPremiumServiceRecordPaid,
  isPremiumServiceRecordDelivered,
} from '../utils/listingPremiumSync.js'
import { markOffPlanApprovalFeePaidFromSession } from '../helper/notifyAssetHolderListingEvents.js'

export const sendServiceNotification = async (data) => {
  try {
    await createNotification({ data })
  } catch (err) {
    console.error('Error sending notification:', err.message)
  }
}

function getModelByAssetType(assetType) {
  if (typeof assetType !== 'string' || !assetType.trim()) return null
  const type = assetType?.trim()?.toLowerCase()
  switch (type) {
    case 'property for lease':
    case 'property for sale':
    case 'property off plan for sale':
      return Property
    case 'car for sale':
      return Cars
    case 'jewellery for sale':
      return Jewelry
    case 'boats for sale':
      return Boats
    default:
      console.error('Unknown asset type:', assetType)
      return Property
  }
}

// subscibe a new serice
const SubscribeServices = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      })
    }

    const {
      productTitle,
      assetType,
      dateTime,
      productId,
      userUUID,
      service,
      price,
      success_url,
      cancel_url,
      category,
      subCategory,
      value,
      isPremiumTopUp,
      fullPrice,
    } = req.body
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''

    if (!req.user._id)
      return res.status(401).json({
        error: true,
        message: 'userId is required or you are not authenticated!',
      })
    if (!productId)
      return res
        .status(401)
        .json({ error: true, message: 'productId is required!' })
    // validateMongoId(userId)

    if (!service || !['_3dwalkthrough', 'surveyor', 'all'].includes(service)) {
      return res.status(400).json({
        error: true,
        message: 'Service can be only _3dwalkthrough, surveyor, or all.',
      })
    }
    if (!success_url)
      return res
        .status(400)
        .json({ error: true, message: 'success url is required!' })

    const sanitizedUserUUID = sanitizeUUID(userUUID)
    const sanitizedProductId = sanitizeUUID(productId)

    if (!sanitizedUserUUID) {
      return res.status(400).json({
        error: true,
        message: 'Invalid user UUID format',
      })
    }

    if (!sanitizedProductId) {
      return res.status(400).json({
        error: true,
        message: 'Invalid product UUID format',
      })
    }

    const GetUser = await User.findOne({ uuid: sanitizedUserUUID, isDeleted: false })
    if (!GetUser)
      return res.status(400).json({ error: true, message: 'User not found.' })
    const AssetModel = getModelByAssetType(assetType)
    const product = await AssetModel.findOne({
      uuid: sanitizedProductId,
      isDeleted: false,
    })
    if (!product) {
      return res.status(404).json({ error: true, message: 'Product not found.' })
    }

    const { request3D: paid3D, reportTech: paidReport } =
      await loadPaidPremiumRecord(product, service)
    const catalogPrice =
      Number(fullPrice) > 0 ? Number(fullPrice) : Number(price)
    const isTopUp =
      Boolean(isPremiumTopUp) &&
      ((service === '_3dwalkthrough' && paid3D) ||
        (service === 'surveyor' && paidReport) ||
        (service === 'all' && paid3D && paidReport))

    let chargeAmount = Number(price)
    if (isTopUp) {
      const paidAmount =
        service === 'surveyor'
          ? Number(paidReport?.price) || 0
          : Number(paid3D?.price) || 0
      const extra = Math.max(0, catalogPrice - paidAmount)
      if (extra <= 0) {
        return res.status(400).json({
          error: true,
          message: 'No extra fee is due. Update the booking without payment.',
        })
      }
      chargeAmount = extra
    }

    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
      return res
        .status(400)
        .json({ error: true, message: 'Price is required!' })
    }

    let reportTech
    let request3D

    if (isTopUp) {
      request3D = paid3D
      reportTech = paidReport
    } else {
      const fieldsToClear = []
      if (service === '_3dwalkthrough') fieldsToClear.push('video3DWalkthrough')
      else if (service === 'surveyor') fieldsToClear.push('technicalReport')
      else if (service === 'all') {
        fieldsToClear.push('technicalReport', 'video3DWalkthrough')
      }
      if (fieldsToClear.length) {
        await clearUnpaidPremiumOnListing(product, AssetModel, fieldsToClear)
      }

      const bookingFields = {
        category,
        subCategory,
        value,
      }

      if (service === 'all') {
        request3D = await Request3D.create({
          name: GetUser?.name,
          email: GetUser?.email,
          dateTime,
          phone: GetUser?.phone || phone,
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          assetType,
          payment_method_status: 'unpaid',
          status: 'pending',
          price: catalogPrice || chargeAmount,
          productTitle,
          productId: product._id,
          productUUID: product.uuid,
          ...bookingFields,
        })

        reportTech = await ReportTechnical.create({
          name: GetUser?.name,
          email: GetUser?.email,
          dateTime,
          phone: GetUser.phone || phone,
          assetType,
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          payment_method_status: 'unpaid',
          status: 'pending',
          price: catalogPrice || chargeAmount,
          productTitle,
          productId: product._id,
          productUUID: product.uuid,
          ...bookingFields,
        })
      } else if (service === '_3dwalkthrough') {
        request3D = await Request3D.create({
          name: GetUser?.name,
          email: GetUser?.email,
          dateTime,
          assetType,
          phone: GetUser?.phone || phone,
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          payment_method_status: 'unpaid',
          status: 'pending',
          price: catalogPrice || chargeAmount,
          productTitle,
          productId: product._id,
          productUUID: product.uuid,
          ...bookingFields,
        })
      } else if (service === 'surveyor') {
        reportTech = await ReportTechnical.create({
          name: GetUser?.name,
          email: GetUser?.email,
          dateTime,
          assetType,
          phone: GetUser.phone || phone,
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          payment_method_status: 'unpaid',
          status: 'pending',
          price: catalogPrice || chargeAmount,
          productTitle,
          productId: product._id,
          productUUID: product.uuid,
          ...bookingFields,
        })
      }

      if (productId && assetType) {
        if (AssetModel && product) {
          const asset = await AssetModel.findById(product._id, {
            isDeleted: false,
          })
          if (asset) {
            if (service === '_3dwalkthrough') {
              asset.video3DWalkthrough = request3D?._id
            } else if (service === 'surveyor') {
              asset.technicalReport = reportTech?._id
            } else if (service === 'all') {
              asset.technicalReport = reportTech?._id
              asset.video3DWalkthrough = request3D?._id
            }
            await asset.save()
          }
        }
      }

      if (service === '_3dwalkthrough') {
        await sendServiceNotification({
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          UserRole: '3dWalkthrough',
          title: 'Request 3D',
          message: `A new asset added for 3d walkthrough.`,
          RelateRoute: '3dWalkthrough',
          RelatedId: product._id,
          RelatedUUID: product.uuid,
        })
      } else if (service === 'surveyor') {
        await sendServiceNotification({
          userId: GetUser._id,
          userUUID: GetUser.uuid,
          UserRole: 'TechnicalReport',
          title: 'Technical Report Request',
          message: `A new asset added for Technical Report.`,
          RelateRoute: 'TechnicalReport',
          RelatedId: product._id,
          RelatedUUID: product.uuid,
        })
      } else if (service === 'all') {
        try {
          await sendServiceNotification({
            userId: GetUser._id,
            userUUID: GetUser.uuid,
            UserRole: 'TechnicalReport',
            title: 'Technical Report Request',
            message: `A new asset added for Technical Report.`,
            RelateRoute: 'TechnicalReport',
            RelatedId: product._id,
            RelatedUUID: product.uuid,
          })
          await sendServiceNotification({
            userId: GetUser._id,
            userUUID: GetUser.uuid,
            UserRole: '3dWalkthrough',
            title: 'Request 3D',
            message: `A new asset added for 3d walkthrough.`,
            RelateRoute: '3dWalkthrough',
            RelatedId: product._id,
            RelatedUUID: product.uuid,
          })
        } catch (error) {
          console.log({ error: error?.message })
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: {
              name: isTopUp
                ? `Extra fee for ${service} service(s)`
                : `Subscription for ${service} service(s)`,
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || success_url,
      metadata: {
        request3DId: request3D?._id?.toString() || '',
        reportTechId: reportTech?._id?.toString() || '',
        productId: productId?.toString() || '',
        userId: GetUser?._id?.toString() || '',
        service,
        assetType,
        isPremiumTopUp: isTopUp ? '1' : '',
        fullPrice: String(catalogPrice || ''),
        dateTime: dateTime ? String(dateTime) : '',
        category: String(category || ''),
        subCategory: String(subCategory || ''),
        value: String(value || ''),
        phone,
      },
    })
    return res.status(201).json({ url: session?.url, sessionId: session?.id })
  } catch (error) {
    console.log(error)
    return res.status(400).json({ error: error.message })
  }
}

const UpdateUserForSubscribeServices = async (req, res) => {
  try {
    const { session_id } = req.query

    if (!session_id) {
      return res
        .status(400)
        .json({ error: true, message: 'session_id is required.' })
    }

    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (!session) {
      return res
        .status(400)
        .json({ error: true, message: 'Session not found.' })
    }

    if (session.payment_status !== 'paid') {
      return res
        .status(400)
        .json({ error: true, message: 'Payment not completed yet.' })
    }

    if (session?.metadata?.paymentType === 'off_plan_approval_fee') {
      const listing = await markOffPlanApprovalFeePaidFromSession(session)
      if (!listing) {
        return res.status(404).json({
          error: true,
          message: 'Off-plan listing not found for this payment.',
        })
      }

      return res.status(200).json({
        message: 'Off-plan approval fee paid successfully.',
        success: true,
        payload: {
          payment_status: 'paid',
          amount_total: (session?.amount_total || 0) / 100,
          currency: session?.currency,
          paymentType: 'off_plan_approval_fee',
          listingUuid: listing.uuid,
        },
      })
    }

    // Read metadata from session
    const userId = session?.metadata?.userId
    const service = session?.metadata?.service
    const request3DId = session?.metadata?.request3DId
    const reportTechId = session?.metadata?.reportTechId

    const GetUser = await User.findById(userId, { isDeleted: false })

    if (!GetUser) {
      return res.status(400).json({ error: true, message: 'User not found.' })
    }

    const payment_method_status =
      session.payment_status === 'paid' ? 'succeeded' : 'failed'
    const payment_details = {
      payment_status:
        session?.payment_status == 'paid' ? 'succeeded' : 'failed',
      amount_total: session?.amount_total,
      currency: session?.currency,
    }

    let request3dwalkthrough
    let reportTech

    const paymentUpdate = {
      payment_details,
      payment_method_status,
      isDeleted: false,
      deletedAt: null,
    }

    if (service === 'all') {
      request3dwalkthrough = await Request3D.findByIdAndUpdate(
        request3DId,
        paymentUpdate,
        { new: true },
      )
      reportTech = await ReportTechnical.findByIdAndUpdate(
        reportTechId,
        paymentUpdate,
        { new: true },
      )
    } else if (service === 'surveyor') {
      reportTech = await ReportTechnical.findByIdAndUpdate(
        reportTechId,
        paymentUpdate,
        { new: true },
      )
    } else if (service === '_3dwalkthrough') {
      request3dwalkthrough = await Request3D.findByIdAndUpdate(
        request3DId,
        paymentUpdate,
        { new: true },
      )
    }

    if (reportTech) {
      await linkTechnicalReportToListing(reportTech)
    }
    if (request3dwalkthrough) {
      await linkWalkthroughToListing(request3dwalkthrough)
    }

    const bookingFields = premiumBookingFieldsFromInput(
      {
        dateTime: session?.metadata?.dateTime,
        category: session?.metadata?.category,
        subCategory: session?.metadata?.subCategory,
        value: session?.metadata?.value,
        phone: session?.metadata?.phone,
        fullPrice: session?.metadata?.fullPrice,
      },
      { applyPrice: session?.metadata?.isPremiumTopUp === '1' },
    )
    if (Object.keys(bookingFields).length) {
      await applyPremiumBookingFields({
        service,
        request3DId,
        reportTechId,
        fields: bookingFields,
      })
    }

    const TransactionRequest = new Transaction({
      payment_method_status,
      payment_details,
      user: userId,
    })

    await TransactionRequest.save()

    const payment = {
      userId,
      payment_method_types: session?.payment_method_types,
      status: session?.status,
      payment_status: session?.payment_status,
      service_subscribed: service,
      amount_subtotal: (session?.amount_subtotal || 1) / 100,
      amount_total: (session?.amount_total || 1) / 100,
      currency: session?.currency,
      email: session?.email,
      name: session?.name,
      expires_at: session?.expires_at,
    }
    return res.status(200).json({
      message: `${service} service(s) subscribed successfully!`,
      payload: payment,
      success: true,
    })
  } catch (error) {
    return res
      .status(400)
      .json({ error: true, message: error?.message || 'Something went wrong!' })
  }
}

const UpdatePremiumServiceBooking = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      })
    }

    const {
      productId,
      assetType,
      service,
      dateTime,
      category,
      subCategory,
      value,
      price,
      phone,
    } = req.body

    if (!service || !['_3dwalkthrough', 'surveyor'].includes(service)) {
      return res.status(400).json({
        error: true,
        message: 'Service can be only _3dwalkthrough or surveyor.',
      })
    }
    if (!dateTime) {
      return res.status(400).json({
        error: true,
        message: 'Date and time are required.',
      })
    }

    const sanitizedProductId = sanitizeUUID(productId)
    if (!sanitizedProductId) {
      return res.status(400).json({
        error: true,
        message: 'Invalid product UUID format',
      })
    }

    const AssetModel = getModelByAssetType(assetType)
    const product = await AssetModel.findOne({
      uuid: sanitizedProductId,
      isDeleted: false,
    })
    if (!product) {
      return res.status(404).json({ error: true, message: 'Product not found.' })
    }

    if (
      String(product.userUUID) !== String(req.user.uuid) &&
      req.user.role !== 'Admin'
    ) {
      return res.status(403).json({
        error: true,
        message: 'You can only update bookings for your own listings.',
      })
    }

    const { request3D, reportTech } = await loadPaidPremiumRecord(
      product,
      service,
    )
    const record = service === '_3dwalkthrough' ? request3D : reportTech
    if (!record || !isPremiumServiceRecordPaid(record)) {
      return res.status(400).json({
        error: true,
        message: 'No paid booking found to update.',
      })
    }
    if (isPremiumServiceRecordDelivered(record)) {
      return res.status(400).json({
        error: true,
        message: 'This service has already been delivered and cannot be changed.',
      })
    }

    const nextPrice = Number(price)
    const paidAmount = Number(record.price) || 0
    if (paidAmount > 0 && Number.isFinite(nextPrice) && nextPrice > paidAmount) {
      return res.status(400).json({
        error: true,
        message: 'This change requires an extra payment.',
      })
    }

    const fields = premiumBookingFieldsFromInput({
      dateTime,
      category,
      subCategory,
      value,
      phone,
    })
    await applyPremiumBookingFields({
      service,
      request3DId: request3D?._id,
      reportTechId: reportTech?._id,
      fields,
    })

    return res.status(200).json({
      success: true,
      message: 'Booking updated successfully.',
    })
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: error?.message || 'Something went wrong!',
    })
  }
}

export { SubscribeServices, UpdateUserForSubscribeServices, UpdatePremiumServiceBooking }
