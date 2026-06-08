import Request3D from '../models/request3DModel.js'
import ReportTechnical from '../models/reportModel.js'
import Property from '../models/propertyModel.js'
import Cars from '../models/carModel.js'
import Boats from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import {
  linkTechnicalReportToListing,
  linkWalkthroughToListing,
} from './listingPremiumSync.js'
import { sendServiceNotification } from '../controller/ServicesCtrl.js'
import { sanitizeUUID } from './nosqlSanitizer.js'

export function resolveAssetModel(assetType) {
  if (typeof assetType !== 'string' || !assetType.trim()) return Property
  const type = assetType.trim().toLowerCase()
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
      return Property
  }
}

export async function createPendingServiceRecords({
  GetUser,
  product,
  AssetModel,
  service,
  price,
  productTitle,
  dateTime,
  phone,
  assetType,
}) {
  let reportTech
  let request3D

  const base = {
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
  }

  if (service === 'all') {
    request3D = await Request3D.create({ ...base })
    reportTech = await ReportTechnical.create({ ...base, phone: GetUser.phone || phone })
  } else if (service === '_3dwalkthrough') {
    request3D = await Request3D.create({ ...base })
  } else if (service === 'surveyor') {
    reportTech = await ReportTechnical.create({ ...base, phone: GetUser.phone || phone })
  }

  if (product && AssetModel) {
    const asset = await AssetModel.findById(product._id, { isDeleted: false })
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

  if (service === '_3dwalkthrough') {
    await sendServiceNotification({
      userId: GetUser._id,
      userUUID: GetUser.uuid,
      UserRole: '3dWalkthrough',
      title: 'Request 3D',
      message: 'A new asset added for 3d walkthrough.',
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
      message: 'A new asset added for Technical Report.',
      RelateRoute: 'TechnicalReport',
      RelatedId: product._id,
      RelatedUUID: product.uuid,
    })
  } else if (service === 'all') {
    await sendServiceNotification({
      userId: GetUser._id,
      userUUID: GetUser.uuid,
      UserRole: 'TechnicalReport',
      title: 'Technical Report Request',
      message: 'A new asset added for Technical Report.',
      RelateRoute: 'TechnicalReport',
      RelatedId: product._id,
      RelatedUUID: product.uuid,
    })
    await sendServiceNotification({
      userId: GetUser._id,
      userUUID: GetUser.uuid,
      UserRole: '3dWalkthrough',
      title: 'Request 3D',
      message: 'A new asset added for 3d walkthrough.',
      RelateRoute: '3dWalkthrough',
      RelatedId: product._id,
      RelatedUUID: product.uuid,
    })
  }

  return { request3D, reportTech }
}

export async function fulfillServicePayment({
  userId,
  service,
  request3DId,
  reportTechId,
  payment_details,
  payment_provider = 'clozer',
}) {
  const payment_method_status =
    payment_details?.payment_status === 'succeeded' ||
      payment_details?.status === 'completed' ||
      payment_details?.status === 'approved'
      ? 'succeeded'
      : 'pending'

  let request3dwalkthrough
  let reportTech

  if (service === 'all') {
    request3dwalkthrough = await Request3D.findByIdAndUpdate(
      request3DId,
      { status: 'successful', payment_details, payment_method_status },
      { new: true },
    )
    reportTech = await ReportTechnical.findByIdAndUpdate(
      reportTechId,
      { status: 'successful', payment_details, payment_method_status },
      { new: true },
    )
  } else if (service === 'surveyor') {
    reportTech = await ReportTechnical.findByIdAndUpdate(
      reportTechId,
      { status: 'successful', payment_details, payment_method_status },
      { new: true },
    )
  } else if (service === '_3dwalkthrough') {
    request3dwalkthrough = await Request3D.findByIdAndUpdate(
      request3DId,
      { status: 'successful', payment_details, payment_method_status },
      { new: true },
    )
  }

  if (reportTech) await linkTechnicalReportToListing(reportTech)
  if (request3dwalkthrough) await linkWalkthroughToListing(request3dwalkthrough)

  return { request3dwalkthrough, reportTech, payment_method_status }
}

export function buildServiceDescription(service, productTitle) {
  const labels = {
    _3dwalkthrough: '3D Walkthrough',
    surveyor: 'Technical Report',
    all: '3D Walkthrough + Technical Report',
    evaluation: 'Asset Evaluation Fee',
    purchase: 'Asset Purchase',
  }
  const label = labels[service] || 'Funds Verifier Service'
  return productTitle ? `${label} — ${productTitle}` : label
}

export async function fulfillPurchasePayment({
  transaction,
  isFullyPaid,
}) {
  const meta = transaction.service_metadata || {}
  const purchaseMeta = meta.purchaseMeta || {}
  const productUuid = sanitizeUUID(
    purchaseMeta.productId || meta.productId,
  )
  const assetType = purchaseMeta.assetType || meta.assetType

  if (!productUuid) {
    throw new Error('Purchase product ID missing from transaction metadata')
  }

  const AssetModel = resolveAssetModel(assetType)
  const product = await AssetModel.findOne({
    uuid: productUuid,
    isDeleted: false,
  })

  if (!product) {
    throw new Error(`Purchase product not found: ${productUuid}`)
  }

  const buyerId = transaction.user
  const update = {
    transactionId: transaction._id,
    dealhunterId: buyerId,
    transactionStatus: isFullyPaid ? 'succeeded' : 'active',
    dealClosed: Boolean(isFullyPaid),
  }

  if (meta.purchase_fulfilled) {
    await AssetModel.findByIdAndUpdate(product._id, { $set: update })
    return { product, buyerId, alreadyFulfilled: true, updated: true }
  }

  if (product.dealhunterId && String(product.dealhunterId) !== String(buyerId)) {
    throw new Error('This asset has already been purchased by another buyer')
  }

  await AssetModel.findByIdAndUpdate(product._id, { $set: update })

  return { product, buyerId, alreadyFulfilled: false, updated: true }
}

export function calculateInstallmentPlan(totalAmount, requestedInstallments) {
  const total = Number(totalAmount)
  if (!Number.isFinite(total) || total <= 0) {
    return { number_of_installments: 1, monthly_installment_amount: total }
  }

  let count = Number(requestedInstallments)
  if (!Number.isFinite(count) || count < 1) {
    count = Math.min(12, Math.max(3, Math.ceil(total / 500)))
  }
  count = Math.min(36, Math.max(1, Math.round(count)))

  const monthly = Math.ceil((total / count) * 100) / 100
  return { number_of_installments: count, monthly_installment_amount: monthly }
}
