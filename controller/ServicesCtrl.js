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
    if (!price)
      return res
        .status(400)
        .json({ error: true, message: 'Price is required!' })
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
    let reportTech
    let request3D

    if (service === 'all') {
      // Create both requests
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
        price,
        productTitle,
        productId: product._id,
        productUUID: product.uuid,
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
        price,
        productTitle,
        productId: product._id,
        productUUID: product.uuid,
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
        price,
        productTitle,
        productId: product._id,
        productUUID: product.uuid,
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
        price,
        productTitle,
        productId: product._id,
        productUUID: product.uuid,
      })
    }

    // Update the asset based on assetType
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

    // For notifications
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
          UserRole: 'TechnicalReport',
          title: 'Technical Report Request',
          message: `A new asset added for Technical Report.`,
          RelateRoute: 'TechnicalReport',
          RelatedId: product._id,
          RelatedUUID: product.uuid,
        })
      } catch (error) {
        console.log({ error: error?.message })
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: {
              name: `Subscription for ${service} service(s)`,
            },
            unit_amount: price * 100,
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

    if (service === 'all') {
      request3dwalkthrough = await Request3D.findByIdAndUpdate(request3DId, {
        status: 'successful',
        payment_details,
        payment_method_status,
      })
      reportTech = await ReportTechnical.findByIdAndUpdate(reportTechId, {
        status: 'successful',
        payment_details,
        payment_method_status,
      })
    } else if (service === 'surveyor') {
      reportTech = await ReportTechnical.findByIdAndUpdate(reportTechId, {
        status: 'successful',
        payment_details,
        payment_method_status,
      })
    } else if (service === '_3dwalkthrough') {
      request3dwalkthrough = await Request3D.findByIdAndUpdate(request3DId, {
        status: 'successful',
        payment_details,
        payment_method_status,
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

export { SubscribeServices, UpdateUserForSubscribeServices }
