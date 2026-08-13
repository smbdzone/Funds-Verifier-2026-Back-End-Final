import SuccessFee from '../models/successFeeModel.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import ContactUs from '../models/Contact.js'
import { stripe } from '../libs/stripe.js'
import SendAssetTransferingMail from '../utils/asset-transfer/SendAssetTransferingMail.js'
import { createNotification } from './notifications.controller.js'
import { notifyFvObligationDisagreed } from '../utils/fvPortalMail.js'

const DEFAULT_FEES = {
  propertySuccessFee: 6000,
  boatSuccessFee: 3000,
  carSuccessFee: 2000,
  jewelrySuccessFee: 2000,
  fullPayDiscountPercent: 5,
}

const clampDiscountPercent = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.min(50, Math.max(0, num))
}

const ASSET_KINDS = {
  property: Property,
  car: Car,
  boat: Boat,
  jewelry: Jewelry,
}

const SOLD_SELECT =
  'uuid title assetType dealhunterId userId successFeePaymentStatus dealClosed updatedAt createdAt'

const populateOpts = [
  { path: 'dealhunterId', select: 'name email' },
  { path: 'userId', select: 'name email' },
]

const getFeeForAssetType = (assetType, fees) => {
  const t = String(assetType || '').toLowerCase()
  if (t.includes('property')) return fees.propertySuccessFee
  if (t.includes('car')) return fees.carSuccessFee
  if (t.includes('jewel')) return fees.jewelrySuccessFee
  if (t.includes('boat')) return fees.boatSuccessFee
  return fees.propertySuccessFee
}

const resolveFees = async () => {
  const doc = await SuccessFee.findOne({ isDeleted: false })
  if (!doc) return { ...DEFAULT_FEES }
  return {
    propertySuccessFee: doc.propertySuccessFee,
    boatSuccessFee: doc.boatSuccessFee,
    carSuccessFee: doc.carSuccessFee,
    jewelrySuccessFee: doc.jewelrySuccessFee,
    fullPayDiscountPercent: doc.fullPayDiscountPercent ?? DEFAULT_FEES.fullPayDiscountPercent,
  }
}

export const resolveFullPayDiscountPercent = async () => {
  const doc = await SuccessFee.findOne({ isDeleted: false }).select(
    'fullPayDiscountPercent',
  )
  if (doc?.fullPayDiscountPercent != null) {
    return clampDiscountPercent(doc.fullPayDiscountPercent)
  }

  const envFallback = Number(process.env.FULL_PAY_DISCOUNT_PERCENT)
  if (Number.isFinite(envFallback)) {
    return clampDiscountPercent(envFallback)
  }

  return DEFAULT_FEES.fullPayDiscountPercent
}

const fetchSoldFromModel = async (Model, kind) => {
  const rows = await Model.find({
    isDeleted: false,
    dealhunterId: { $exists: true, $ne: null },
  })
    .select(SOLD_SELECT)
    .populate(populateOpts)
    .sort({ updatedAt: -1 })
    .lean()

  return rows.map((row) => ({
    ...row,
    type: kind,
    successFeePaymentStatus: row.successFeePaymentStatus || 'Pending',
  }))
}

export const getPublicFullPayDiscount = async (req, res) => {
  try {
    const fullPayDiscountPercent = await resolveFullPayDiscountPercent()
    return res.status(200).json({ success: true, fullPayDiscountPercent })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch full pay discount',
      error: error.message,
    })
  }
}

/** Public success-fee amounts for obligation / disclosure UI (no auth). */
export const getPublicSuccessFees = async (req, res) => {
  try {
    const fees = await resolveFees()
    return res.status(200).json({
      success: true,
      currency: 'AED',
      propertySuccessFee: fees.propertySuccessFee,
      boatSuccessFee: fees.boatSuccessFee,
      carSuccessFee: fees.carSuccessFee,
      jewelrySuccessFee: fees.jewelrySuccessFee,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch success fees',
      error: error.message,
    })
  }
}

/**
 * User disagreed with seller success-fee obligation terms.
 * Works for signed-in users and guests (arrange viewing before login).
 * Stores contact message, notifies Admin in-app, emails FV_EMAIL.
 */
export const reportObligationDisagree = async (req, res) => {
  try {
    const user = req.user || null

    const {
      context = 'unknown',
      assetType = '',
      listingTitle = '',
      listingUuid = '',
      amount = null,
      message: extraMessage = '',
    } = req.body || {}

    const fees = await resolveFees()
    const resolvedAmount =
      amount != null && Number.isFinite(Number(amount))
        ? Number(amount)
        : getFeeForAssetType(assetType, fees)

    const isGuest = !user
    const fullName =
      user?.name ||
      user?.displayName ||
      user?.email ||
      (isGuest ? 'Guest (not signed in)' : 'Funds Verifier user')
    const email = user?.email || 'guest@fundsverifier.com'
    const phone = user?.phone || user?.mobile || user?.phoneNumber || 'N/A'
    const contextLabel =
      String(context).toLowerCase() === 'viewing'
        ? 'Arrange viewing'
        : String(context).toLowerCase() === 'listing'
          ? 'Asset listing (before payment)'
          : String(context || 'Unknown')

    const subject = `Sale obligation disagreed — ${contextLabel}`
    const message = [
      `User disagreed with the seller success-fee obligation terms.`,
      `Context: ${contextLabel}`,
      `Signed in: ${isGuest ? 'No (guest)' : 'Yes'}`,
      `Asset type: ${assetType || 'N/A'}`,
      `Listing: ${listingTitle || 'N/A'}`,
      listingUuid ? `Listing UUID: ${listingUuid}` : null,
      `Stated obligation amount: AED ${Number(resolvedAmount).toLocaleString()}`,
      `User UUID: ${user?.uuid || 'N/A'}`,
      `User role: ${user?.role || 'N/A'}`,
      extraMessage ? `Note: ${String(extraMessage).slice(0, 1000)}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const contact = await ContactUs.create({
      fullName: String(fullName).slice(0, 200),
      email: String(email).slice(0, 200),
      subject: String(subject).slice(0, 200),
      phone: String(phone).slice(0, 50),
      message: String(message).slice(0, 5000),
    })

    try {
      await createNotification({
        data: {
          UserRole: 'Admin',
          title: 'Sale obligation disagreed',
          message: `${fullName} disagreed with seller obligation terms (${contextLabel}).`,
          RelateRoute: 'contact',
          RelatedUUID: contact.uuid,
        },
      })
    } catch (notifyErr) {
      console.log({ error: notifyErr?.message })
    }

    try {
      await notifyFvObligationDisagreed({
        user: user || { name: fullName, email },
        context: contextLabel,
        assetType,
        listingTitle,
        listingUuid,
        amount: resolvedAmount,
      })
    } catch (mailErr) {
      console.log({ error: mailErr?.message })
    }

    return res.status(200).json({
      success: true,
      message: 'Your response was sent to Funds Verifier admin.',
      contactUuid: contact.uuid,
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to notify admin',
      error: error.message,
    })
  }
}

export const getSuccessFees = async (req, res) => {
  try {
    const doc = await SuccessFee.findOne({ isDeleted: false })
    if (!doc) {
      return res.status(200).json({ ...DEFAULT_FEES, _defaults: true })
    }
    return res.status(200).json(doc)
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch success fees',
      error: error.message,
    })
  }
}

export const updateSuccessFees = async (req, res) => {
  try {
    const {
      propertySuccessFee,
      boatSuccessFee,
      carSuccessFee,
      jewelrySuccessFee,
      fullPayDiscountPercent,
    } = req.body

    const values = [
      propertySuccessFee,
      boatSuccessFee,
      carSuccessFee,
      jewelrySuccessFee,
    ]

    if (values.some((v) => v == null || Number.isNaN(Number(v)) || Number(v) < 0)) {
      return res.status(400).json({
        message: 'All success fees must be non-negative numbers.',
      })
    }

    const discountValue =
      fullPayDiscountPercent == null
        ? DEFAULT_FEES.fullPayDiscountPercent
        : Number(fullPayDiscountPercent)

    if (
      Number.isNaN(discountValue) ||
      discountValue < 0 ||
      discountValue > 50
    ) {
      return res.status(400).json({
        message: 'Full pay discount must be between 0 and 50 percent.',
      })
    }

    let doc = await SuccessFee.findOne({ isDeleted: false })
    if (doc) {
      doc.propertySuccessFee = Number(propertySuccessFee)
      doc.boatSuccessFee = Number(boatSuccessFee)
      doc.carSuccessFee = Number(carSuccessFee)
      doc.jewelrySuccessFee = Number(jewelrySuccessFee)
      doc.fullPayDiscountPercent = discountValue
      await doc.save()
    } else {
      doc = await SuccessFee.create({
        propertySuccessFee: Number(propertySuccessFee),
        boatSuccessFee: Number(boatSuccessFee),
        carSuccessFee: Number(carSuccessFee),
        jewelrySuccessFee: Number(jewelrySuccessFee),
        fullPayDiscountPercent: discountValue,
      })
    }

    return res.status(200).json({
      message: 'Success fees updated successfully',
      ...doc.toObject(),
    })
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to update success fees',
      error: error.message,
    })
  }
}

export const getSoldTransactions = async (req, res) => {
  try {
    const [properties, cars, boats, jewelry] = await Promise.all([
      fetchSoldFromModel(Property, 'property'),
      fetchSoldFromModel(Car, 'car'),
      fetchSoldFromModel(Boat, 'boat'),
      fetchSoldFromModel(Jewelry, 'jewelry'),
    ])

    const transactions = [...properties, ...cars, ...boats, ...jewelry].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
    )

    return res.status(200).json({ transactions })
  } catch (error) {
    console.error('getSoldTransactions:', error)
    return res.status(500).json({
      message: 'Failed to load sold transactions',
      error: error.message,
    })
  }
}

export const sendSuccessFeePaymentLink = async (req, res) => {
  try {
    const { assetMongoId, assetKind } = req.body

    if (!assetMongoId || !assetKind) {
      return res.status(400).json({
        message: 'assetMongoId and assetKind are required.',
      })
    }

    const Model = ASSET_KINDS[String(assetKind).toLowerCase()]
    if (!Model) {
      return res.status(400).json({ message: 'Invalid assetKind.' })
    }

    const asset = await Model.findOne({
      _id: assetMongoId,
      isDeleted: false,
    })
      .populate({ path: 'userId', select: 'name email' })
      .populate({ path: 'thumbnailImg', select: 'images' })

    if (!asset) {
      return res.status(404).json({ message: 'Asset not found.' })
    }

    if (!asset.userId?.email) {
      return res.status(400).json({ message: 'Seller has no email on file.' })
    }

    const fees = await resolveFees()
    const amountAed = getFeeForAssetType(asset.assetType, fees)
    if (!amountAed || amountAed <= 0) {
      return res.status(400).json({ message: 'Success fee amount is not configured.' })
    }

    const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:5002/').replace(
      /\/$/,
      ''
    )
    const successUrl = `${frontendBase}/service-payment-success`

    const thumbUrl =
      asset?.thumbnailImg?.images?.[0]?.url ||
      asset?.thumbnailImg?.images?.[0]?.secure_url ||
      undefined

    const productData = {
      name: `Success fee — ${asset.title || asset.assetType || 'Asset'}`,
      description: asset.assetType || 'Asset transaction',
    }
    if (thumbUrl) productData.images = [thumbUrl]

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: productData,
            unit_amount: Math.round(amountAed * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: asset.userId.email,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: successUrl,
      metadata: {
        paymentType: 'success_fee',
        assetKind: String(assetKind).toLowerCase(),
        assetId: String(asset._id),
      },
    })

    const assetLink = `${frontendBase}/property/${asset.slug || asset.uuid}`

    const mailResult = await SendAssetTransferingMail({
      PaymentUrl: session.url,
      assetName: asset.title || asset.assetType || 'Asset',
      assetLink,
      AssetHolder: asset.userId,
      broker: asset.userId,
    })

    return res.status(200).json({
      message: mailResult.success
        ? 'Payment link email sent to seller.'
        : mailResult.message || 'Payment link created but email may not have been sent.',
      emailSent: mailResult.success === true,
      paymentUrl: session.url,
    })
  } catch (error) {
    console.error('sendSuccessFeePaymentLink:', error)
    return res.status(500).json({
      message: 'Could not send payment link.',
      error: error.message,
    })
  }
}
