import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import User from '../models/userModel.js'

export const getAssetModelForType = (assetType = '') => {
  const type = assetType.toLowerCase()
  if (type.includes('car')) return Car
  if (type.includes('property')) return Property
  if (type.includes('jewel')) return Jewelry
  if (type.includes('boat')) return Boat
  return Property
}

/** Bookings snapshot productData with uuid; fall back to _id when present. */
export const findAssetForBooking = async (booking) => {
  const productData = booking?.productData || {}
  const AssetModel = getAssetModelForType(productData.assetType)

  if (productData.uuid) {
    const asset = await AssetModel.findOne({
      uuid: productData.uuid,
      isDeleted: false,
    })
    if (asset) return { AssetModel, asset }
  }

  if (productData._id) {
    const asset = await AssetModel.findOne({
      _id: productData._id,
      isDeleted: false,
    })
    if (asset) return { AssetModel, asset }
  }

  return { AssetModel, asset: null }
}

export const deriveTransactionPhase = (booking) => {
  const productData = booking?.productData || {}
  const transferDocuments = productData.transferDocuments || {}

  if (productData.dealClosed || booking?.status === 'completed') return 'transferred'
  if (transferDocuments.PaymentProof) return 'payment_proof_received'
  if (transferDocuments.assetTransferDocument) return 'awaiting_payment'
  if (booking?.status === 'under_process') return 'under_process'
  return null
}

export const isTransactionBooking = (booking) =>
  deriveTransactionPhase(booking) !== null

export const completedTransactionStatusForAssetType = (assetType = '') => {
  const type = assetType.toLowerCase()
  if (type.includes('car') || type.includes('boat')) return 'complete'
  return 'completed'
}

export const syncAssetTransactionOnPaymentProof = (asset) => {
  asset.successFeePaymentStatus = 'Paid'
}

export const syncAssetTransactionOnTransferComplete = (asset, brokerId, assetType) => {
  asset.dealClosed = true
  asset.dealer = brokerId
  if (brokerId) asset.dealhunterId = brokerId
  asset.successFeePaymentStatus = 'Paid'
  asset.transactionStatus = completedTransactionStatusForAssetType(assetType)
}

/** Mixed `productData` on bookings must be explicitly marked modified after nested edits. */
export const patchBookingProductData = (booking, patch) => {
  if (!booking || typeof booking !== 'object') return booking
  booking.productData = {
    ...(booking.productData || {}),
    ...(patch || {}),
  }
  if (typeof booking.markModified === 'function') {
    booking.markModified('productData')
  }
  return booking
}

export const patchBookingTransferDocuments = (booking, patch) => {
  if (!booking || typeof booking !== 'object') return booking
  const current = booking.productData?.transferDocuments || {}
  return patchBookingProductData(booking, {
    transferDocuments: {
      ...current,
      ...(patch || {}),
    },
  })
}

export const mergeTransferDocuments = (bookingDocs = {}, assetDocs = {}) => {
  const booking = bookingDocs || {}
  const asset = assetDocs || {}
  const pickFee = (...values) => {
    for (const value of values) {
      const num = Number(value)
      if (Number.isFinite(num) && num > 0) return num
    }
    return null
  }

  return {
    assetTransferDocument:
      booking.assetTransferDocument || asset.assetTransferDocument || null,
    successFee: pickFee(booking.successFee, asset.successFee),
    PaymentProof: booking.PaymentProof || asset.PaymentProof || null,
    paymentUrl: booking.paymentUrl || asset.paymentUrl || null,
  }
}

export const resolveTransferDocumentsForBooking = async (booking) => {
  const snapshot = booking?.productData?.transferDocuments || {}
  try {
    const { asset } = await findAssetForBooking(booking)
    const assetDocs = asset?.transferDocuments?.toObject?.()
      ? asset.transferDocuments.toObject()
      : asset?.transferDocuments || {}
    return mergeTransferDocuments(snapshot, assetDocs)
  } catch {
    return mergeTransferDocuments(snapshot, {})
  }
}

export async function resolveBookingAssetHolder(booking) {
  if (booking?.assetHolderId?.email) {
    return booking.assetHolderId
  }

  const holderUuid = booking?.assetHolderUUID
  if (!holderUuid) return null

  return User.findOne({ uuid: holderUuid, isDeleted: false }).select(
    'email name uuid',
  )
}
