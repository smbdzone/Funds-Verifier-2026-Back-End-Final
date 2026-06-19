import User from '../models/userModel.js'
import Transaction from '../models/transactionModel.js'
import { sanitizeUUID } from '../utils/nosqlSanitizer.js'
import {
  generateFvTransactionId,
  signClozerRedirectToken,
  verifyClozerRedirectToken,
  verifyClozerWebhookSignature,
} from '../utils/clozerToken.js'
import {
  buildServiceDescription,
  calculateInstallmentPlan,
  createPendingServiceRecords,
  fulfillPurchasePayment,
  fulfillServicePayment,
  resolveAssetModel,
} from '../utils/clozerServiceHelpers.js'
import { isEmiratesIdComplete } from '../utils/emiratesIdValidator.js'
import { logClozerEvent } from '../utils/clozerAuditLog.js'

function formatCif(user) {
  const uuid = String(user?.uuid || '').replace(/-/g, '').toUpperCase()
  if (!uuid) return ''
  return `FV-${uuid.slice(0, 8)}`
}

const SERVICE_TYPES = [
  '_3dwalkthrough',
  'surveyor',
  'all',
  'evaluation',
  'purchase',
]

const PAID_CLOZER_STATUSES = new Set([
  'approved',
  'active',
  'completed',
  'paid',
  'succeeded',
])

function formatDateOnly(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function buildClozerPayload(transaction, user) {
  const meta = transaction.service_metadata || {}
  const fullName =
    user?.emiratesId?.fullName ||
    [user?.name, user?.lastname].filter(Boolean).join(' ').trim() ||
    user?.name ||
    ''

  return {
    transaction_id: transaction.fvTransactionId,
    full_name: fullName,
    emirates_id_number: user?.emiratesId?.number || '',
    eid_expiry_date: formatDateOnly(user?.emiratesId?.expiryDate) || '',
    cif: formatCif(user),
    email: user?.email || '',
    mobile: user?.phone || meta.phone || '',
    total_invoice_amount: transaction.total_amount,
    monthly_installment_amount: transaction.monthly_installment_amount,
    number_of_installments: transaction.number_of_installments,
    service_description:
      meta.service_description ||
      buildServiceDescription(transaction.service_type, meta.productTitle),
  }
}

function getClozerApplyBaseUrl() {
  if (process.env.CLOZER_APPLY_URL) {
    return process.env.CLOZER_APPLY_URL
  }
  return process.env.NODE_ENV === 'production'
    ? 'https://clozer.ae/fundsverifier'
    : 'https://test.clozer.ae/fundsverifier'
}

function buildRedirectUrl(fvTransactionId, token) {
  const url = new URL(getClozerApplyBaseUrl())
  url.searchParams.set('transaction_id', fvTransactionId)
  url.searchParams.set('token', token)
  return url.toString()
}

const ASSET_HOLDER_SERVICES = new Set([
  '_3dwalkthrough',
  'surveyor',
  'all',
  'evaluation',
])

export const initiateClozerPayment = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const actor = await User.findById(req.user._id, { isDeleted: false }).select(
      'role uuid name email phone emiratesId',
    )
    if (!actor) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    if (!process.env.CLOZER_REDIRECT_SECRET && !process.env.SECRET_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Clozer redirect signing is not configured',
      })
    }

    const {
      service,
      price,
      productId,
      productTitle,
      assetType,
      userUUID,
      dateTime,
      phone,
      success_url,
      number_of_installments,
      listingDraft,
      purchaseMeta,
    } = req.body

    if (!service || !SERVICE_TYPES.includes(service)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service type for Clozer payment',
      })
    }

    if (
      ASSET_HOLDER_SERVICES.has(service) &&
      actor.role !== 'AssetHolder' &&
      actor.role !== 'Admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only asset holders can pay for this service via installments',
      })
    }

    const amount = Number(price)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid price is required',
      })
    }

    const sanitizedUserUUID = sanitizeUUID(userUUID || req.user.uuid)
    if (!sanitizedUserUUID || sanitizedUserUUID !== actor.uuid) {
      return res.status(403).json({
        success: false,
        message: 'User mismatch',
      })
    }

    const GetUser = actor

    if (!isEmiratesIdComplete(GetUser)) {
      return res.status(400).json({
        success: false,
        code: 'EMIRATES_ID_REQUIRED',
        message:
          'Please add your Emirates ID details in your profile before paying by installments.',
      })
    }

    const installmentPlan = calculateInstallmentPlan(
      amount,
      number_of_installments,
    )

    let serviceMetadata = {
      service,
      productTitle: productTitle || '',
      assetType: assetType || '',
      phone: typeof phone === 'string' ? phone.trim() : GetUser.phone || '',
      service_description: buildServiceDescription(service, productTitle),
      success_url: success_url || '',
    }

    let request3DId = ''
    let reportTechId = ''

    if (['_3dwalkthrough', 'surveyor', 'all'].includes(service)) {
      const sanitizedProductId = sanitizeUUID(productId)
      if (!sanitizedProductId) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required for this service',
        })
      }

      const AssetModel = resolveAssetModel(assetType)
      const product = await AssetModel.findOne({
        uuid: sanitizedProductId,
        isDeleted: false,
      })
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found',
        })
      }

      const { request3D, reportTech } = await createPendingServiceRecords({
        GetUser,
        product,
        AssetModel,
        service,
        price: amount,
        productTitle,
        dateTime,
        phone: serviceMetadata.phone,
        assetType,
      })

      request3DId = request3D?._id?.toString() || ''
      reportTechId = reportTech?._id?.toString() || ''
      serviceMetadata = {
        ...serviceMetadata,
        productId: sanitizedProductId,
        request3DId,
        reportTechId,
      }
    } else if (service === 'evaluation' && listingDraft) {
      serviceMetadata.listingDraft = listingDraft
    } else if (service === 'purchase') {
      const purchaseProductId = sanitizeUUID(
        purchaseMeta?.productId || productId,
      )
      if (!purchaseProductId) {
        return res.status(400).json({
          success: false,
          message: 'Valid productId is required for purchase installments',
        })
      }

      const purchaseAssetType = purchaseMeta?.assetType || assetType
      const AssetModel = resolveAssetModel(purchaseAssetType)
      const product = await AssetModel.findOne({
        uuid: purchaseProductId,
        isDeleted: false,
      })

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found for purchase',
        })
      }

      if (product.dealhunterId || product.dealClosed) {
        return res.status(409).json({
          success: false,
          message: 'This asset has already been purchased',
        })
      }

      serviceMetadata = {
        ...serviceMetadata,
        productId: purchaseProductId,
        assetType: purchaseAssetType || product.assetType || '',
        productTitle: productTitle || product.title || serviceMetadata.productTitle,
        purchaseMeta: {
          ...(purchaseMeta || {}),
          productId: purchaseProductId,
          assetType: purchaseAssetType || product.assetType || '',
          totalAed: purchaseMeta?.totalAed ?? amount,
        },
      }
    }

    const fvTransactionId = generateFvTransactionId()
    const { token, expiresAt } = signClozerRedirectToken(
      fvTransactionId,
      GetUser._id.toString(),
      amount,
    )

    const transaction = await Transaction.create({
      user: GetUser._id,
      fvTransactionId,
      payment_provider: 'clozer',
      payment_method_status: 'pending',
      clozer_status: 'pending',
      service_type: service,
      service_metadata: serviceMetadata,
      total_amount: amount,
      monthly_installment_amount: installmentPlan.monthly_installment_amount,
      number_of_installments: installmentPlan.number_of_installments,
      redirect_token_expires: expiresAt,
      payment_details: {
        provider: 'clozer',
        initiated_at: new Date().toISOString(),
      },
    })

    const redirectUrl = buildRedirectUrl(fvTransactionId, token)

    console.info('[Clozer] Payment initiated', {
      fvTransactionId,
      userId: GetUser._id.toString(),
      service,
      amount,
    })
    logClozerEvent('payment_initiated', {
      fvTransactionId,
      userId: GetUser._id.toString(),
      service,
      amount,
      ip: req.ip,
    })

    return res.status(201).json({
      success: true,
      redirectUrl,
      transaction_id: fvTransactionId,
      transactionUuid: transaction.uuid,
    })
  } catch (error) {
    console.error('[Clozer] initiate error', error.message)
    return res.status(400).json({
      success: false,
      message: error.message || 'Could not initiate Clozer payment',
    })
  }
}

export const getClozerTransaction = async (req, res) => {
  try {
    const { transaction_id } = req.params
    if (!transaction_id) {
      return res.status(400).json({ success: false, message: 'transaction_id required' })
    }

    const transaction = await Transaction.findOne({
      fvTransactionId: transaction_id,
      payment_provider: 'clozer',
      isDeleted: false,
    }).populate('user')

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    const user = transaction.user
    if (!user || user.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      })
    }

    logClozerEvent('transaction_fetched', {
      fvTransactionId: transaction_id,
      ip: req.ip,
    })

    return res.status(200).json({
      success: true,
      data: buildClozerPayload(transaction, user),
    })
  } catch (error) {
    console.error('[Clozer] get transaction error', error.message)
    return res.status(500).json({
      success: false,
      message: 'Could not retrieve transaction',
    })
  }
}

export const getClozerTransactionStatus = async (req, res) => {
  try {
    const { transaction_id } = req.params
    const transaction = await Transaction.findOne({
      fvTransactionId: transaction_id,
      payment_provider: 'clozer',
      isDeleted: false,
      user: req.user._id,
    })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        transaction_id: transaction.fvTransactionId,
        clozer_status: transaction.clozer_status,
        payment_method_status: transaction.payment_method_status,
        total_amount: transaction.total_amount,
        installments_paid: transaction.installments_paid || 0,
        total_paid: transaction.total_paid || 0,
        service_type: transaction.service_type,
        installment_updates: transaction.installment_updates || [],
      },
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Could not fetch status',
    })
  }
}

export const handleInstallmentUpdate = async (req, res) => {
  try {
    const rawBody =
      req.rawBody ||
      (typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {}))

    const signature =
      req.headers['x-clozer-signature'] ||
      req.headers['x-webhook-signature']

    const verification = verifyClozerWebhookSignature(rawBody, signature)
    if (!verification.valid && process.env.NODE_ENV === 'production') {
      logClozerEvent('webhook_rejected', {
        reason: verification.reason,
        ip: req.ip,
      })
      return res.status(401).json({ success: false, message: 'Invalid signature' })
    }

    const payload =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    const transaction_id = payload?.transaction_id
    const status = String(payload?.status || '').toLowerCase()

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        message: 'transaction_id is required',
      })
    }

    const transaction = await Transaction.findOne({
      fvTransactionId: transaction_id,
      payment_provider: 'clozer',
      isDeleted: false,
    })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    const installmentEntry = {
      status: payload.status,
      installment_number: payload.installment_number,
      amount_paid: payload.amount_paid,
      total_paid: payload.total_paid,
      message: payload.message,
      received_at: new Date(),
    }

    transaction.installment_updates = [
      ...(transaction.installment_updates || []),
      installmentEntry,
    ]
    transaction.clozer_status = status || transaction.clozer_status
    transaction.installments_paid =
      payload.installment_number || transaction.installments_paid || 0
    transaction.total_paid = Number(payload.total_paid) || transaction.total_paid || 0

    const isPaid = PAID_CLOZER_STATUSES.has(status)
    const isFullyPaid =
      status === 'completed' ||
      (transaction.total_paid >= transaction.total_amount &&
        transaction.total_amount > 0)

    if (isPaid || isFullyPaid) {
      transaction.payment_method_status = isFullyPaid ? 'succeeded' : 'active'
    }

    transaction.payment_details = {
      ...(transaction.payment_details || {}),
      last_webhook: payload,
      updated_at: new Date().toISOString(),
    }

    await transaction.save()

    const meta = transaction.service_metadata || {}
    if (
      (isPaid || isFullyPaid) &&
      ['_3dwalkthrough', 'surveyor', 'all'].includes(transaction.service_type) &&
      !transaction.service_metadata?.service_fulfilled
    ) {
      await fulfillServicePayment({
        userId: transaction.user,
        service: meta.service || transaction.service_type,
        request3DId: meta.request3DId,
        reportTechId: meta.reportTechId,
        payment_details: {
          payment_status: isFullyPaid ? 'succeeded' : 'active',
          status,
          total_paid: transaction.total_paid,
          total_amount: transaction.total_amount,
          provider: 'clozer',
        },
        payment_provider: 'clozer',
      })
      transaction.service_metadata = {
        ...meta,
        service_fulfilled: true,
      }
      await transaction.save()
    }

    if ((isPaid || isFullyPaid) && transaction.service_type === 'evaluation') {
      transaction.payment_method_status = isFullyPaid ? 'succeeded' : 'active'
      await transaction.save()
    }

    if (
      (isPaid || isFullyPaid) &&
      transaction.service_type === 'purchase'
    ) {
      try {
        await fulfillPurchasePayment({
          transaction,
          isFullyPaid,
        })
        if (!meta.purchase_fulfilled) {
          transaction.service_metadata = {
            ...meta,
            purchase_fulfilled: true,
          }
          await transaction.save()
        }
      } catch (purchaseError) {
        console.error('[Clozer] purchase fulfillment error', purchaseError.message)
        logClozerEvent('purchase_fulfillment_failed', {
          transaction_id,
          error: purchaseError.message,
          ip: req.ip,
        })
      }
    }

    logClozerEvent('installment_update', {
      transaction_id,
      status,
      total_paid: transaction.total_paid,
      ip: req.ip,
    })

    return res.status(200).json({ success: true, message: 'Update received' })
  } catch (error) {
    console.error('[Clozer] webhook error', error.message)
    return res.status(500).json({
      success: false,
      message: error.message || 'Webhook processing failed',
    })
  }
}

export const verifyClozerRedirect = async (req, res) => {
  try {
    const { transaction_id } = req.params
    const token = req.query.token

    if (!transaction_id || !token) {
      return res.status(400).json({
        success: false,
        message: 'transaction_id and token are required',
      })
    }

    const transaction = await Transaction.findOne({
      fvTransactionId: transaction_id,
      payment_provider: 'clozer',
      isDeleted: false,
    })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      })
    }

    const verification = verifyClozerRedirectToken(
      token,
      transaction_id,
      transaction.user.toString(),
      transaction.total_amount,
    )

    logClozerEvent('redirect_token_verified', {
      fvTransactionId: transaction_id,
      valid: verification.valid,
      reason: verification.reason,
      ip: req.ip,
    })

    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        message: verification.reason || 'Invalid redirect token',
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        transaction_id,
        valid: true,
        expires_at: verification.expiresAt,
      },
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Could not verify redirect token',
    })
  }
}

export const getClozerSampleTransaction = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found' })
  }

  const sampleUser = {
    uuid: 'sample-user-uuid-0001',
    name: 'Ahmed',
    lastname: 'Mohammed',
    email: 'customer@example.com',
    phone: '+971501234567',
    emiratesId: {
      fullName: 'Ahmed Mohammed',
      number: '784-XXXX-XXXXXXX-X',
      expiryDate: new Date('2028-05-30'),
    },
  }

  const sampleTransaction = {
    fvTransactionId: 'FV-SAMPLE01',
    total_amount: 5500,
    monthly_installment_amount: 550,
    number_of_installments: 10,
    service_type: 'purchase',
    service_metadata: {
      service_description: 'Asset transaction — Sample Property',
    },
  }

  return res.status(200).json({
    success: true,
    data: buildClozerPayload(sampleTransaction, sampleUser),
    note: 'Development sample only — not a real transaction',
  })
}

const SERVICE_LABELS = {
  _3dwalkthrough: '3D Walkthrough',
  surveyor: 'Technical Report',
  all: '3D + Technical Report',
  evaluation: 'Evaluation Fee',
  purchase: 'Asset Purchase',
}

export const listMyInstallments = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user: req.user._id,
      payment_provider: 'clozer',
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        'fvTransactionId clozer_status payment_method_status service_type service_metadata total_amount monthly_installment_amount number_of_installments installments_paid total_paid installment_updates createdAt updatedAt',
      )

    const data = transactions.map((t) => ({
      transaction_id: t.fvTransactionId,
      clozer_status: t.clozer_status,
      payment_method_status: t.payment_method_status,
      service_type: t.service_type,
      service_label:
        SERVICE_LABELS[t.service_type] || t.service_type || 'Payment',
      service_description:
        t.service_metadata?.service_description ||
        t.service_metadata?.productTitle ||
        '',
      total_amount: t.total_amount,
      monthly_installment_amount: t.monthly_installment_amount,
      number_of_installments: t.number_of_installments,
      installments_paid: t.installments_paid || 0,
      total_paid: t.total_paid || 0,
      progress_percent:
        t.total_amount > 0
          ? Math.min(100, Math.round((t.total_paid / t.total_amount) * 100))
          : 0,
      installment_updates: (t.installment_updates || []).slice(-5),
      created_at: t.createdAt,
      updated_at: t.updatedAt,
    }))

    return res.status(200).json({ success: true, data })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Could not load installment payments',
    })
  }
}
