import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'

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
