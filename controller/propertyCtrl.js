import User from '../models/assetHolderModel.js'
import asyncHandler from 'express-async-handler'
import Property from '../models/propertyModel.js'
import slugify from 'slugify'
import processQuery from '../utils/priceRange.js'
import Request3D from '../models/request3DModel.js'
import Report from '../models/reportModel.js'
import mongoose from 'mongoose'
import upload from '../middlewares/Multer.js'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
import { verifyToken } from '../middlewares/JwtAuth.js'
import UserModel from '../models/userModel.js'
import { AssetsListingsPricing } from '../utils/AssetsListingsPricing.js'
import { createNotification } from './notifications.controller.js'
import { notifyEvaluatorsNewListing, notifyAssetHolderListingSubmitted } from '../helper/notificationHelpers.js'
import { notifyAssetHolderDocumentRequested } from '../helper/notifyDocumentRequested.js'
import {
  listingBecameEvaluatorApproved,
  notifyAssetHolderListingApproved,
  notifyAssetHolderOffPlanApproved,
  notifyAssetHolderOffPlanFeeRequested,
} from '../helper/notifyAssetHolderListingEvents.js'
import { notifyFvListingPosted } from '../utils/fvPortalMail.js'
import { stripe } from '../libs/stripe.js'
import { AddPaymentJob } from '../utils/jobs/index.js'
import UserPaymentDetails from '../models/UserPaymentDetails.js'
import { PUBLIC_PROPERTY_FIELDS } from '../constants/publicFields.js'
import { attachDocumentSignedUrls } from '../helper/attachDocumentSignedUrls.js'
import {
  REQUEST_DOCUMENT_POPULATE,
  applyRequestDocumentUpdate,
  attachRequestDocumentSignedUrls,
  normalizeRequestDocumentList,
} from '../helper/requestDocumentHelpers.js'
import {
  stripNullPremiumRefs,
  refreshListingPremiumFieldsForEdit,
  sanitizeUnpaidPremiumServicesForClient,
} from '../utils/listingPremiumSync.js'
import {
  refreshListingMediaSignedUrls,
  refreshListingsMediaSignedUrls,
} from '../helper/refreshAssetSignedUrls.js'
import {
  sanitizeListingMediaResponse,
  sanitizeListingsMediaResponse,
} from '../helper/sanitizeListingResponse.js'
import {
  recordListingClick,
} from '../helper/listingAnalytics.js'
import {
  getListingSellersByUuid,
  resolveListingSeller,
  getSellerRef,
} from '../helper/listingSellerInfo.js'
import {
  getSafeStringParam,
  getSafeTitleRegex,
  pickScalarFilters,
  applyListingStatusFilters,
  applyEvaluatorPendingFilter,
  applyRoiRangeFilter,
} from '../utils/listingQuery.js'
import { buildListingIdQuery } from '../utils/listingIdLookup.js'
import {
  blockPriceChangeIfUnderProcess,
  stripUnderProcessFromListingPayload,
} from '../utils/listingUnderProcess.js'
import {
  applyOffPlanAutoApproval,
  isOffPlanAssetType,
} from '../utils/offPlanAsset.js'

const app = express()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

app.use(express.static(path.join(__dirname, 'public')))
const filterPublicFields = (doc, allowedFields) => {
  const result = {}
  allowedFields.forEach((key) => {
    if (doc[key] !== undefined) result[key] = doc[key]
  })
  return result
}

// create product
const createProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  const user = req.user

  try {
    // Create the new Property
    if (req.body.title) {
      req.body.slug = slugify(req.body.title)
    }
    if (!req.body.price) {
      return res.status(400).json({ message: 'Price of an asset is required.' })
    }
    req.body.listing = AssetsListingsPricing({
      type: 'property',
      listing: req.body.listing || 'Public',
      price: req.body.price,
    })

    stripNullPremiumRefs(req.body)

    const isOffPlan = isOffPlanAssetType(req.body.assetType)
    applyOffPlanAutoApproval(req.body)

    const createPdt = await Property.create([req.body], { session })

    // Deferred Stripe evaluation fee — skip for off-plan and Clozer installments
    const paidViaClozer =
      req.body?.payment_provider === 'clozer' ||
      Boolean(req.body?.clozer_transaction_id)

    if (!paidViaClozer && !isOffPlan) {
      try {
        const PaymentDetails = await UserPaymentDetails.create({
          userId: user?._id,
          userUUID: user?.uuid,
          assetId: createPdt?.[0]?._id,
          assetTitle: createPdt?.[0]?.title,
          assetType: 'property',
          customerId: req?.body?.customerId,
          paymentMethod: req?.body?.paymentMethod,
        })
        await AddPaymentJob({
          jobId: PaymentDetails?._id,
          assetId: createPdt?.[0]?.uuid,
          assetType: 'property',
          PaymentDetailsId: PaymentDetails?.uuid,
          userId: createPdt?.[0]?.userId,
        })
      } catch (error) {
        console.log(`Error adding job to queue: ${error.message}`)
      }
    }

    // Find the latest pending 3D Request
    const pendingRequest = await Request3D.findOneAndUpdate(
      { status: 'pending', isDeleted: { $ne: true } },
      {
        productId: createPdt[0]._id,
        productUUID: createPdt[0].uuid,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
      },
      { new: true, sort: { createdAt: -1 }, session },
    )
    const pendingReport = await Report.findOneAndUpdate(
      { status: 'pending', isDeleted: { $ne: true } },
      {
        productId: createPdt[0]._id,
        productUUID: createPdt[0].uuid,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
      },
      { new: true, sort: { createdAt: -1 }, session },
    )

    if (pendingRequest || pendingReport) {
      await session.commitTransaction()
      session.endSession()
      res.json({
        property: createPdt[0],
        updatedRequest: pendingRequest || 'No pending request found',
        updatedReport: pendingReport || 'No pending report found',
      })
      //  res.json({ property: createPdt[0], updatedRequest: pendingRequest });
    } else {
      await session.commitTransaction()
      res.json({
        property: createPdt[0],
        message:
          'Property created successfully, but no pending 3D request or report was found to update.',
      })
    }

    try {
      if (!isOffPlan) {
        await notifyEvaluatorsNewListing({
          message: `New property (${createPdt[0]?.title}) added for evaluation.`,
          assetType: createPdt[0]?.assetType || 'property',
          relatedId: createPdt[0]._id,
          relatedUUID: createPdt[0]?.uuid,
          listing: createPdt[0],
          assetHolder: user,
        })
      } else {
        await createNotification({
          data: {
            UserRole: 'Admin',
            title: 'Off-Plan Request',
            message: `New off-plan listing (${createPdt[0]?.title}) is pending Super Admin approval.`,
            RelateRoute: 'offplan-requests',
            RelatedId: createPdt[0]._id,
            RelatedUUID: createPdt[0]?.uuid,
          },
        })
        await notifyFvListingPosted({
          listing: createPdt[0],
          assetHolder: user,
          assetType: createPdt[0]?.assetType || 'off plan',
        })
        await notifyAssetHolderListingSubmitted({
          listing: createPdt[0],
          assetHolder: user,
          assetType: createPdt[0]?.assetType || 'off plan',
        })
      }
    } catch (error) {
      console.log({ error: error?.message })
    }
    return
  } catch (err) {
    await session.abortTransaction()
    session.endSession()
    res.status(500).json({
      message: 'Error creating property or updating request pt update report',
      error: err.message,
    })
  }
})

const getSingleProperty = asyncHandler(async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'Invalid property ID' })
  }

  const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
  const sanitizedUuid = sanitizeUUID(id)
  const lookupQuery = { isDeleted: false }

  if (sanitizedUuid) {
    lookupQuery.$or = [{ uuid: sanitizedUuid }, { slug: id }]
  } else {
    lookupQuery.slug = id
  }

  try {
    const property = await Property.findOne(lookupQuery)
      .populate('pictures')
      .populate('video')
      .populate('uploadDocument')
      .populate(REQUEST_DOCUMENT_POPULATE)
      .populate('thumbnailImg')
      .populate('video3DWalkthrough')
      .populate('transactionDepositDocument')
      .populate('transactionId')
      .populate('dealhunterId')
      .populate('userId')
      .populate({
        path: 'technicalReport',
        populate: { path: 'reportFile' },
      })
      .populate('evaluationCertificate')
      .populate('agencyAgreement')
      .populate('unitLayout')
      .populate('floorPlan')
      .populate('titleDeed')
      .populate('qrScan')
      .lean()

    if (!property) {
      return res.status(404).json({ message: 'Property not found' })
    }

    property.requestDocument = normalizeRequestDocumentList(
      property.requestDocument,
    )

    await refreshListingMediaSignedUrls(property)

    const isPrivilegedUser =
      req.user &&
      ['AssetHolder', 'Admin', 'Evaluator', 'Sub-Evaluator'].includes(
        req.user.role,
      )

    if (!isPrivilegedUser) {
      recordListingClick(Property, property)
      await attachDocumentSignedUrls(property, {
        fields: ['evaluationCertificate', 'technicalReport'],
      })
      const publicFields = PUBLIC_PROPERTY_FIELDS.trim().split(/\s+/)
      const publicProperty = filterPublicFields(property, publicFields)
      const sellersByUuid = await getListingSellersByUuid([property])
      const seller = resolveListingSeller(property, sellersByUuid)
      if (seller) {
        publicProperty.sellerAvatar = seller.profileImage || ''
        publicProperty.sellerName = seller.name || ''
        publicProperty.sellerRef = getSellerRef(seller)
        publicProperty.userId = {
          profileImage: seller.profileImage || '',
          name: seller.name || '',
        }
      }
      sanitizeListingMediaResponse(publicProperty)
      sanitizeUnpaidPremiumServicesForClient(publicProperty)
      return res.json(publicProperty)
    }

    // Privileged users see evaluation certificate / technical report / invoice
    // etc. — attach fresh `signedUrl` so the frontend can render the docs
    // without the URL having expired since they were stored.
    await attachDocumentSignedUrls(property)
    await attachRequestDocumentSignedUrls(property)

    // Strip server-internal S3 metadata (s3Bucket / s3Key / etc.) before
    // responding. The signed URL is everything the client needs.
    sanitizeListingMediaResponse(property)
    await refreshListingPremiumFieldsForEdit(property)

    res.json(property)
  } catch (err) {
    console.error('Error fetching property:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
})

// get all product
const getAllProduct = asyncHandler(async (req, res) => {
  try {
    const isAuthenticated = !!req.user
    const user = req.user

    // ------------------ BASE FILTER ------------------
    const parseData = {
      isDeleted: false,
      listing: /Public/i, // 🔐 default: PUBLIC ONLY
    }

    // ------------------ SEARCH & FILTERS (SAFE) ------------------
    const titleFilter = getSafeTitleRegex(req.query)
    if (titleFilter) {
      parseData.title = titleFilter
    }

    Object.assign(parseData, pickScalarFilters(req.query))

    if (req.query.minPrice || req.query.maxPrice) {
      parseData.price = {}
      if (req.query.minPrice) parseData.price.$gte = +req.query.minPrice
      if (req.query.maxPrice) parseData.price.$lte = +req.query.maxPrice
    }

    applyRoiRangeFilter(parseData, req.query)

    applyListingStatusFilters(parseData, req.query)
    applyEvaluatorPendingFilter(parseData, req.query)

    if (req.query.propertyForSale) {
      const saleVal = String(req.query.propertyForSale).trim()
      if (/^yes$/i.test(saleVal)) {
        parseData.$and = [
          ...(parseData.$and || []),
          {
            $or: [
              { propertyForSale: { $regex: /^yes$/i } },
              {
                assetType: { $regex: /for sale|off plan/i },
                $or: [
                  { propertyForLease: { $exists: false } },
                  { propertyForLease: null },
                  { propertyForLease: '' },
                  { propertyForLease: { $not: /^yes$/i } },
                ],
              },
            ],
          },
        ]
      } else {
        parseData.propertyForSale = {
          $regex: new RegExp(`^${saleVal}$`, 'i'),
        }
      }
    }

    if (req.query.propertyForLease) {
      parseData.propertyForLease = {
        $regex: new RegExp(`^${String(req.query.propertyForLease).trim()}$`, 'i'),
      }
    }

    if (req.query.propertyType) {
      parseData.propertyType = {
        $regex: new RegExp(`^${String(req.query.propertyType).trim()}$`, 'i'),
      }
    }

    // ------------------ AUTHENTICATED LOGIC ------------------
    if (isAuthenticated) {
      const isSubEvaluator = ['Sub-Evaluator', 'SubEvaluator'].includes(
        user.role,
      )

      if (isSubEvaluator) {
        parseData.$and = [
          ...(parseData.$and || []),
          {
            $or: [{ evaluator: user._id }, { evaluatorUUID: user.uuid }],
          },
        ]
        delete parseData.listing
      }

      const roleNorm = String(user.role || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]/g, '')
      const isElevatedModerator =
        ['Admin', 'Evaluator', 'Trustee'].includes(user.role) ||
        roleNorm === 'superadmin'

      // Evaluator / Admin / Super Admin: moderation (all listing visibilities)
      if (!isSubEvaluator && isElevatedModerator) {
        delete parseData.listing
      }

      // DealHunter logic
      if (
        !isSubEvaluator &&
        user.role === 'DealHunter' &&
        user.financialInfo?.status === 'Approved'
      ) {
        parseData.$or = [
          { listing: /Public/i },
          {
            listing: /Private/i,
            price: { $lte: Number(user.financialInfo.fundsVerification) },
          },
        ]
        delete parseData.listing
      }

      // AssetHolder dashboard
      if (
        !isSubEvaluator &&
        user.role?.toLowerCase() === 'assetholder' &&
        req.query.dashboard === 'true'
      ) {
        parseData.userUUID = user.uuid
        delete parseData.listing
      }
    }

    // ------------------ QUERY BUILD ------------------
    let query = Property.find(parseData)

    // 🔐 PUBLIC VS AUTH FIELD SELECTION
    if (!isAuthenticated) {
      query = query.select(PUBLIC_PROPERTY_FIELDS)
    } else {
      query = query.select('-__v')
    }

    query = query
      .populate({ path: 'pictures', select: '-_id' })
      .populate({ path: 'video', select: '-_id' })
      .populate({ path: 'thumbnailImg', select: '-_id' })
      .populate({ path: 'unitLayout', select: '-_id' })
      .populate({ path: 'floorPlan', select: '-_id' })
      .populate({ path: 'titleDeed', select: '-_id' })
      .populate({ path: 'qrScan', select: '-_id' })
      .populate({ path: 'userId', select: 'profileImage name uuid' })
      .populate({ path: 'evaluationCertificate', select: '-_id' })
      .populate({ path: 'video3DWalkthrough', select: '-_id' })
      .populate({
        path: 'technicalReport',
        select: '-_id',
        populate: { path: 'reportFile', select: '-_id' },
      })

    if (isAuthenticated) {
      query = query
        .populate({ path: 'agencyAgreement', select: '-_id' })
        .populate({ path: 'uploadDocument', select: '-_id' })
        .populate(REQUEST_DOCUMENT_POPULATE)
        .populate({ path: 'invoice', select: '-_id' })
        .populate({ path: 'evaluator', select: 'name displayName uuid' })
    }

    query = query.populate({
      path: 'reviews',
      match: {
        isDeleted: false,
        $or: [{ status: 'approved' }, { status: { $exists: false } }],
      },
      select: isAuthenticated
        ? 'ratingNumber review -_id'
        : 'ratingNumber -_id',
    })

    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ')
      query = query.sort(sortBy)
    } else {
      query = query.sort('-createdAt')
    }

    // ------------------ PAGINATION ------------------
    const page = +req.query.page || 1
    const limit = +req.query.limit || 10
    const skip = (page - 1) * limit

    const total = await Property.countDocuments(parseData)
    const products = await query.skip(skip).limit(limit)

    // Post-find hook on Property model already refreshed signed URLs on
    // populated media; re-run as a safety net for non-hooked paths.
    await refreshListingsMediaSignedUrls(products)

    const sellersByUuid = await getListingSellersByUuid(products)

    // ------------------ RESPONSE SANITIZATION ------------------
    // Doc-signing is async (it may hit S3 presign for non-image buckets), so
    // map → async → Promise.all here. Public callers skip signing on this path
    // (see `getAllProductByFilter` for public card PDF URLs).
    const finalProducts = await Promise.all(
      products.map(async (product) => {
        const obj = product.toObject()

        const reviewCount = obj.reviews?.length || 0
        const averageRating =
          reviewCount > 0
            ? obj.reviews.reduce((a, c) => a + c.ratingNumber, 0) / reviewCount
            : 0

        // Seller avatar for cards (populated userId or userUUID fallback)
        const seller = resolveListingSeller(obj, sellersByUuid)
        if (seller) {
          obj.sellerAvatar = seller.profileImage || ''
          obj.sellerName = seller.name || ''
          obj.sellerRef = getSellerRef(seller)
        }

        // 🔥 REMOVE SENSITIVE FIELDS FOR PUBLIC (keep card certs / reports)
        if (!isAuthenticated) {
          delete obj.uploadDocument
          delete obj.invoice
          delete obj.agencyAgreement
          delete obj.userUUID

          // Keep seller avatar for cards; strip other user fields
          obj.userId = {
            profileImage: seller?.profileImage || '',
            name: seller?.name || '',
          }

          // ratings → stars only
          if (Array.isArray(obj.ratings)) {
            obj.ratings = obj.ratings.map((r) => ({ star: r.star }))
          }
        }

        // Card PDFs for everyone; full docs only for authenticated users
        if (isAuthenticated) {
          await attachDocumentSignedUrls(obj)
          obj.requestDocument = normalizeRequestDocumentList(obj.requestDocument)
          await attachRequestDocumentSignedUrls(obj)
        } else {
          await attachDocumentSignedUrls(obj, {
            fields: ['evaluationCertificate', 'technicalReport'],
          })
        }

        // Drop internal S3 fields before serializing (signedUrl is enough).
        sanitizeListingMediaResponse(obj)

        return {
          ...obj,
          reviewCount,
          averageRating,
        }
      }),
    )

    return res.json({
      products: finalProducts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      limit,
      totalProducts: total,
    })
  } catch (err) {
    return res.status(500).json({
      message: err?.message || 'Something went wrong!',
    })
  }
})

// get all product
const getAllProductByFilter = asyncHandler(async (req, res) => {
  const header = req.headers['authorization']
  const token = header && header.split(' ')[1]
  let userId = null
  // Find price by minPrice and maxPrice
  const modifiedQuery = processQuery(req.query)

  if (token) {
    userId = verifyToken(token)
    if (userId) {
      const GetUser = await UserModel.findById(userId, {
        isDeleted: false,
      }).select('_id financialInfo')
      if (
        GetUser?.financialInfo &&
        GetUser?.financialInfo?.status === 'Approved'
      ) {
        modifiedQuery.$or = [
          { listing: 'Public' },
          {
            listing: 'Private',
            price: { $lte: Number(GetUser.financialInfo.fundsVerification) },
          },
        ]
      } else {
        modifiedQuery.$or = [{ listing: 'Public' }]
      }
    }
  }

  // Facility filtering (assuming "facilities" is a field in the Property model)
  if (req.query.facilities) {
    const desiredFacilities = req.query.facilities.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allFacilities) {
      // Find properties with ALL specified facilities
      modifiedQuery.facilities = { $all: desiredFacilities }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.facilities = { $in: desiredFacilities }
    }
  }
  modifiedQuery.isDeleted = false
  modifiedQuery.status = 1
  let query = Property.find(modifiedQuery)
    .populate('pictures')
    .populate('video')
    .populate('thumbnailImg')
    .populate('evaluationCertificate')
    .populate('video3DWalkthrough')
    .populate('unitLayout')
    .populate('floorPlan')
    .populate('titleDeed')
    .populate('qrScan')
    .populate({ path: 'userId', select: 'profileImage name uuid' })
    .populate({
      path: 'technicalReport',
      populate: { path: 'reportFile' },
    })
    .select('-_id')
  // sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ')
    query = query.sort(sortBy)
  } else {
    query = query.sort('-createdAt')
  }

  // limiting the fields
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ')
    query = query.select(fields)
  } else {
    query = query.select('')
  }

  // pagination
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  query = query.skip(skip).limit(limit)

  const productCount = await Property.countDocuments()

  if (skip >= productCount) {
    return res
      .status(400)
      .json({ message: 'Assets on this page does not exist' })
  }

  try {
    const allProductRaw = await query
    const sellersByUuid = await getListingSellersByUuid(allProductRaw)
    const allProduct = allProductRaw.map((p) => {
      const obj = typeof p.toObject === 'function' ? p.toObject() : p
      const seller = resolveListingSeller(obj, sellersByUuid)
      if (seller) {
        obj.sellerAvatar = seller.profileImage || ''
        obj.sellerName = seller.name || ''
        obj.sellerRef = getSellerRef(seller)
      }
      return obj
    })
    await refreshListingsMediaSignedUrls(allProduct)
    // Listing cards need fresh `signedUrl` on evaluation certificate / technical
    // report. Authenticated users also get uploadDocument + invoice when present.
    await Promise.all(
      allProduct.map((p) =>
        userId
          ? attachDocumentSignedUrls(p)
          : attachDocumentSignedUrls(p, {
            fields: ['evaluationCertificate', 'technicalReport'],
          }),
      ),
    )
    // Strip server-internal S3 metadata before responding.
    sanitizeListingsMediaResponse(allProduct)
    const totalFilteredProducts =
      await Property.countDocuments(modifiedQuery).select('-_id')

    return res.status(200).json({
      products: allProduct,
      currentPage: page,
      totalPages: Math.ceil(totalFilteredProducts / limit),
      limit: req?.query?.limit ? parseFloat(req?.query?.limit) : 10,
      totalProducts: totalFilteredProducts,
    })
    // return res.status(200).json(allProduct);
  } catch (err) {
    return res.status(500).json({
      error: err?.message,
      message: err?.message || 'Something went wrong!',
    })
  }
})

const getRelatedProduct = asyncHandler(async (req, res) => {
  const assetType = getSafeStringParam(req.query, 'assetType')
  const country = getSafeStringParam(req.query, 'country')
  const city = getSafeStringParam(req.query, 'city')
  const propertyType = getSafeStringParam(req.query, 'propertyType')
  const price = getSafeStringParam(req.query, 'price')

  // Construct the query object based on provided properties
  const queryObj = {}
  if (assetType) queryObj.assetType = assetType
  if (country) queryObj.country = country
  if (city) queryObj.city = city
  if (propertyType) queryObj.propertyType = propertyType
  if (price) queryObj.price = price
  queryObj.isDeleted = false
  try {
    const allProductRaw = await Property.find(queryObj)
      .select('-_id')
      .populate({ path: 'pictures', select: '-_id' })
      .populate({ path: 'thumbnailImg', select: '-_id' })
      .populate({ path: 'video', select: '-_id' })

    const allProduct = allProductRaw.map((p) =>
      typeof p.toObject === 'function' ? p.toObject() : p,
    )
    await refreshListingsMediaSignedUrls(allProduct)
    sanitizeListingsMediaResponse(allProduct)
    return res.status(200).json(allProduct)
  } catch (err) {
    return res.status(200).json({ message: err?.message })
  }
})

// get update product
const updateProduct = asyncHandler(async (req, res) => {
  const { moduleId } = req.params

  upload.fields([
    { name: 'technicalReport', maxCount: 1 },
    { name: 'evaluationCertificate', maxCount: 1 },
    { name: 'uploadDocument', maxCount: 100 },
  ])(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message })
    }
    try {
      // validateMongoId(id)
      // Find the existing product
      const product = await Property.findOne(
        buildListingIdQuery(moduleId),
      ).populate('uploadDocument')
      // Populate existing documents
      if (!product) {
        return res.status(404).json({ message: 'Property not found' })
      }

      stripUnderProcessFromListingPayload(req.body)
      const priceBlock = blockPriceChangeIfUnderProcess(product, req.body)
      if (priceBlock) {
        return res.status(403).json({ message: priceBlock })
      }

      // Update slug if title is provided
      if (req.body.title) {
        req.body.slug = slugify(req.body.title)
      }

      const documentFulfilled = Boolean(req.body.fulfillRequestDocument)
      applyRequestDocumentUpdate(product, req.body)

      const requestedDocumentsUpdated =
        Boolean(req.body.requestDocument) && !documentFulfilled

      // Handle uploadDocument IDs (from frontend)
      if (req.body.uploadDocument && !documentFulfilled) {
        const newDocumentIds = Array.isArray(req.body.uploadDocument)
          ? req.body.uploadDocument // If multiple IDs are passed as an array
          : [req.body.uploadDocument] // If only a single ID is passed as a string

        // Append to existing uploadDocument array
        req.body.uploadDocument = [
          ...(product.uploadDocument || []).map((doc) => doc._id), // Keep existing document IDs
          ...newDocumentIds, // Add new IDs from the request body
        ]
      }
      let updatedProduct
      // if (product?.evaluationCertificate) {
      //   console.log('asdfghujiosdfghjk')

      //   updatedProduct = await Property.findByIdAndUpdate(
      //     id,
      //     { price: req.body.price || product?.price },
      //     { new: true }
      //   )
      // } else {
      stripNullPremiumRefs(req.body)
      updatedProduct = await Property.findByIdAndUpdate(
        product._id,
        { $set: req.body },
        { new: true },
      ).select('-_id')

      // }

      try {
        if (requestedDocumentsUpdated) {
          await notifyAssetHolderDocumentRequested({
            listing: updatedProduct,
            assetType: 'property',
            requesterRole: req.user?.role,
            title: 'Document Request',
          })
        } else if (
          listingBecameEvaluatorApproved(product, updatedProduct)
        ) {
          await notifyAssetHolderListingApproved({
            listing: {
              ...(updatedProduct?.toObject?.() || updatedProduct),
              _id: product._id,
              userUUID: updatedProduct?.userUUID || product.userUUID,
            },
            assetType: 'property',
            evaluator: req.user,
          })
        } else {
          const NotificationData = {
            UserRole: 'AssetHolder',
            userUUID: updatedProduct?.userUUID,
            title: 'Assets Property',
            message: `Property (${updatedProduct?.title}) has been updated.`,
            RelateRoute: `property`,
            RelatedId: updatedProduct?._id,
          }
          if (documentFulfilled) {
            NotificationData.UserRole = 'Evaluator'
            NotificationData.userUUID = updatedProduct?.evaluatorUUID
            NotificationData.message = `Seller uploaded a requested document for property (${updatedProduct?.title}).`
            NotificationData.RelateRoute = 'evaluation'
          }
          await createNotification({ data: NotificationData })
        }
      } catch (error) {
        console.log({ error: error?.message })
      }

      return res.status(200).json(updatedProduct)
    } catch (err) {
      res.status(500).json({
        message: 'An error occurred while updating the property',
        error: err.message,
      })
    }
  })
})

const deleteProduct = asyncHandler(async (req, res) => {
  const { deleteId } = req.params

  try {
    // validateMongoId(id)
    console.log(deleteId)

    const property = await Property.findOne({
      uuid: deleteId,
      isDeleted: false,
    })
    console.log(property)

    if (!property || property.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Property not found or already deleted' })
    }

    const requester = req.user
    if (requester?.role !== 'Admin') {
      if (
        !requester?.uuid ||
        String(property.userUUID) !== String(requester.uuid)
      ) {
        return res.status(403).json({
          message: 'You are not allowed to delete this property',
        })
      }
    }

    // Soft delete
    property.isDeleted = true
    property.deletedAt = new Date()
    await property.save()

    // Send notification
    try {
      const NotificationData = {
        userId: property.userId,
        userUUID: property.userUUID,
        UserRole: 'AssetHolder',
        title: 'Assets Property',
        message: `Property (${property.title}) has been deleted.`,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.json({ message: 'Property soft-deleted successfully', property })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

const addToWishList = asyncHandler(async (req, res) => {
  const { id } = req.user
  const { prodId } = req.body
  try {
    const user = await User.findById({ uuid: id, isDeleted: false })
    const allreadyAdd = user.wishlist.find((id) => id.toString() === prodId)
    if (allreadyAdd) {
      const user = await User.findByIdAndUpdate(
        id,
        { $pull: { wishlist: prodId } },
        { new: true },
      )
      res.json(user)
    } else {
      const user = await User.findByIdAndUpdate(
        id,
        { $push: { wishlist: prodId } },
        { new: true },
      ).select('-_id')
      res.json(user)
    }
  } catch (err) {
    throw new Error(err)
  }
})

const addRating = asyncHandler(async (req, res, next) => {
  // const { id } = req.user;
  const { star, prodId, comment, id } = req.body
  try {
    const product = await Property.findById({ uuid: prodId, isDeleted: false })
    let allreadyRated = product.ratings.find(
      (rating) => rating.postedBy.toString() === id.toString(),
    )
    if (allreadyRated) {
      const updateRating = await Property.updateOne(
        {
          ratings: { $elemMatch: allreadyRated },
        },
        {
          $set: { 'ratings.$.star': star, 'ratings.$.comment': comment },
        },
        {
          new: true,
        },
      ).select('-_id')
    } else {
      const rateProduct = await Property.findByIdAndUpdate(
        product._id,
        {
          $push: {
            ratings: {
              star: star,
              comment: comment,
              postedBy: id,
            },
          },
        },
        {
          new: true,
        },
      ).select('-_id')
    }
    const getallrating = await Property.findById(product._id, {
      isDeleted: false,
    }).select('-_id')
    let totalRating = getallrating.ratings.length
    let ratingSum = getallrating.ratings
      .map((item) => item.star)
      .reduce((prev, current) => prev + current, 0)
    let actualRating = Math.round(ratingSum / totalRating)
    const finalProduct = await Property.findByIdAndUpdate(
      product._id,
      {
        totalrating: actualRating,
      },
      {
        new: true,
      },
    ).select('-_id')
    res.json(finalProduct)
  } catch (err) {
    throw new Error(err)
  }
})

const getPrice = async (req, res) => {
  try {
    const priceAggregation = await Property.aggregate([
      {
        $group: {
          _id: null,
          maxPrice: { $max: '$price' },
          minPrice: { $min: '$price' },
        },
      },
    ])

    if (!priceAggregation.length) {
      return res.status(404).json({ message: 'No products found' })
    }

    const { maxPrice, minPrice } = priceAggregation[0]
    return res.json({ highestPrice: maxPrice, lowestPrice: minPrice })
  } catch (err) {
    console.log(err)

    return res.status(500).json({ message: 'Internal server error' })
  }
}

const getApprovedListingsMetrics = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const currentYear = new Date().getFullYear()
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear

    const metrics = await Property.aggregate([
      {
        $match: { status: 1 }, // Only approved listings
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
      {
        $project: {
          year: '$_id.year',
          month: '$_id.month',
          count: 1,
          isCurrentMonth: {
            $eq: ['$_id.month', currentMonth],
          },
          isLastMonth: {
            $eq: ['$_id.month', lastMonth],
          },
        },
      },
    ])

    const currentMonthData = metrics.find(
      (m) => m.isCurrentMonth && m.year === currentYear,
    )
    const lastMonthData = metrics.find(
      (m) => m.isLastMonth && m.year === lastMonthYear,
    )

    const currentMonthCount = currentMonthData?.count || 0
    const lastMonthCount = lastMonthData?.count || 0

    const percentageChange =
      lastMonthCount === 0
        ? 0
        : ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100

    res.json({
      totalApprovedListings: currentMonthCount,
      monthlyTrend: {
        currentMonth: currentMonthCount,
        lastMonth: lastMonthCount,
        percentageChange: percentageChange.toFixed(2),
      },
    })
  } catch (error) {
    console.log(error)
  }
}

/** Super Admin: list off-plan listings awaiting / past approval. */
const getOffPlanRequests = asyncHandler(async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const skip = (page - 1) * limit
    const statusParam = String(req.query.status || 'pending').toLowerCase()

    const query = {
      isDeleted: false,
      assetType: { $regex: /off\s*plan/i },
    }

    if (statusParam === 'pending' || statusParam === '0') {
      query.status = 0
    } else if (statusParam === 'approved' || statusParam === '1') {
      query.status = 1
    }

    const [products, total] = await Promise.all([
      Property.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'pictures', select: '-_id' })
        .populate({ path: 'thumbnailImg', select: '-_id' })
        .populate({ path: 'agencyAgreement', select: '-_id' })
        .populate(REQUEST_DOCUMENT_POPULATE)
        .select('-__v')
        .lean(),
      Property.countDocuments(query),
    ])

    await refreshListingsMediaSignedUrls(products)

    for (const product of products) {
      product.requestDocument = normalizeRequestDocumentList(
        product.requestDocument,
      )
      await attachRequestDocumentSignedUrls(product)
      await attachDocumentSignedUrls(product, { fields: ['agencyAgreement'] })
      sanitizeListingMediaResponse(product)
    }

    res.json({
      products,
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Could not load off-plan requests',
      error: error.message,
    })
  }
})

/** Super Admin only: approve or set pending an off-plan listing. */
const updateOffPlanRequestStatus = asyncHandler(async (req, res) => {
  try {
    const { moduleId } = req.params
    const nextStatus = Number(req.body?.status)

    if (![0, 1].includes(nextStatus)) {
      return res
        .status(400)
        .json({ message: 'status must be 0 (pending) or 1 (approved)' })
    }

    const product = await Property.findOne(buildListingIdQuery(moduleId))
    if (!product) {
      return res.status(404).json({ message: 'Off-plan listing not found' })
    }

    if (!isOffPlanAssetType(product.assetType)) {
      return res
        .status(400)
        .json({ message: 'Only off-plan listings can be updated here' })
    }

    product.status = nextStatus
    product.evaluationStatus = nextStatus === 1 ? 'approved' : 'pending'
    await product.save()

    try {
      if (product.userUUID && nextStatus === 1) {
        await notifyAssetHolderOffPlanApproved({ listing: product })
      } else if (product.userUUID) {
        await createNotification({
          data: {
            UserRole: 'AssetHolder',
            userUUID: product.userUUID,
            title: 'Off-Plan Listing',
            message: `Your off-plan listing (${product.title}) was set back to pending.`,
            RelateRoute: 'property',
            RelatedId: product._id,
            RelatedUUID: product.uuid,
          },
        })
      }
    } catch (notifyErr) {
      console.log({ error: notifyErr?.message })
    }

    res.json(product)
  } catch (error) {
    res.status(500).json({
      message: 'Could not update off-plan status',
      error: error.message,
    })
  }
})

/** Super Admin: request documents on an off-plan listing (optional before approve). */
const requestOffPlanDocuments = asyncHandler(async (req, res) => {
  try {
    const { moduleId } = req.params
    const product = await Property.findOne(buildListingIdQuery(moduleId))

    if (!product) {
      return res.status(404).json({ message: 'Off-plan listing not found' })
    }

    if (!isOffPlanAssetType(product.assetType)) {
      return res
        .status(400)
        .json({ message: 'Only off-plan listings can be updated here' })
    }

    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'requestDocument')) {
      return res.status(400).json({ message: 'requestDocument is required' })
    }

    const body = { requestDocument: req.body.requestDocument }
    applyRequestDocumentUpdate(product, body)

    const nextDocs = normalizeRequestDocumentList(body.requestDocument)
    if (!nextDocs.length) {
      return res.status(400).json({
        message: 'Add at least one document name before requesting.',
      })
    }

    const missingDate = nextDocs.some((doc) => !doc.date)
    if (missingDate) {
      return res.status(400).json({
        message: 'Each requested document must have a date.',
      })
    }

    product.requestDocument = nextDocs
    await product.save()

    const updated = await Property.findById(product._id)
      .populate(REQUEST_DOCUMENT_POPULATE)
      .lean()

    if (updated) {
      updated.requestDocument = normalizeRequestDocumentList(
        updated.requestDocument,
      )
      await attachRequestDocumentSignedUrls(updated)
    }

    try {
      await notifyAssetHolderDocumentRequested({
        listing: updated || product,
        assetType: 'off-plan',
        requesterRole: req.user?.role || 'Admin',
        title: 'Document Request',
      })
    } catch (notifyErr) {
      console.log({ error: notifyErr?.message })
    }

    res.json(updated || product)
  } catch (error) {
    res.status(500).json({
      message: 'Could not request documents for off-plan listing',
      error: error.message,
    })
  }
})

/** Super Admin: optional off-plan approval fee payment request (Stripe + notify/email). */
const requestOffPlanApprovalFee = asyncHandler(async (req, res) => {
  try {
    const { moduleId } = req.params
    const amount = Number(req.body?.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: 'Enter a valid approval fee amount greater than 0.',
      })
    }

    const product = await Property.findOne(buildListingIdQuery(moduleId))
    if (!product) {
      return res.status(404).json({ message: 'Off-plan listing not found' })
    }

    if (!isOffPlanAssetType(product.assetType)) {
      return res
        .status(400)
        .json({ message: 'Only off-plan listings can be updated here' })
    }

    if (product.offPlanApprovalFeeStatus === 'paid') {
      return res.status(400).json({
        message: 'Approval fee is already paid for this listing.',
      })
    }

    const holder = await UserModel.findOne(
      { uuid: product.userUUID, isDeleted: false },
      { email: 1, name: 1, uuid: 1 },
    )

    if (!holder?.email) {
      return res.status(400).json({
        message: 'Asset holder email was not found for this listing.',
      })
    }

    const frontendBase = String(
      process.env.FRONTEND_URL || 'https://fundsverifier.com',
    ).replace(/\/$/, '')
    const successUrl = `${frontendBase}/service-payment-success`

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: {
              name: `Off-plan approval fee — ${product.title || 'Listing'}`,
              description: 'Optional Super Admin off-plan approval fee',
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: holder.email,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBase}/seller-profile/invoices`,
      metadata: {
        paymentType: 'off_plan_approval_fee',
        listingId: String(product._id),
        listingUuid: String(product.uuid || ''),
        userUUID: String(product.userUUID || ''),
      },
    })

    product.offPlanApprovalFee = amount
    product.offPlanApprovalFeeStatus = 'requested'
    product.offPlanApprovalFeePaymentUrl = session.url
    product.offPlanApprovalFeeSessionId = session.id
    product.offPlanApprovalFeePaidAt = null
    await product.save()

    try {
      await notifyAssetHolderOffPlanFeeRequested({
        listing: product,
        amount,
        paymentUrl: session.url,
      })
    } catch (notifyErr) {
      console.log({ error: notifyErr?.message })
    }

    res.json({
      message: 'Approval fee payment request sent to asset holder.',
      paymentUrl: session.url,
      product,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Could not request off-plan approval fee',
      error: error.message,
    })
  }
})

/** Super Admin: attach or clear optional agency agreement PDF on an off-plan listing. */
const updateOffPlanAgencyAgreement = asyncHandler(async (req, res) => {
  try {
    const { moduleId } = req.params
    const product = await Property.findOne(buildListingIdQuery(moduleId))

    if (!product) {
      return res.status(404).json({ message: 'Off-plan listing not found' })
    }

    if (!isOffPlanAssetType(product.assetType)) {
      return res
        .status(400)
        .json({ message: 'Only off-plan listings can be updated here' })
    }

    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'agencyAgreement')) {
      return res.status(400).json({ message: 'agencyAgreement is required' })
    }

    const nextValue = req.body.agencyAgreement
    product.agencyAgreement =
      nextValue === null || nextValue === '' || nextValue === undefined
        ? null
        : nextValue

    await product.save()

    const updated = await Property.findById(product._id)
      .populate({ path: 'agencyAgreement', select: '-_id' })
      .lean()

    await attachDocumentSignedUrls(updated, { fields: ['agencyAgreement'] })
    sanitizeListingMediaResponse(updated)

    res.json({
      message: product.agencyAgreement
        ? 'Agency agreement saved.'
        : 'Agency agreement removed.',
      product: updated,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Could not update agency agreement',
      error: error.message,
    })
  }
})

export {
  createProduct,
  //  getSingleProduct,
  getSingleProperty,
  getAllProduct,
  updateProduct,
  deleteProduct,
  addToWishList,
  addRating,
  getRelatedProduct,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
  getOffPlanRequests,
  updateOffPlanRequestStatus,
  requestOffPlanDocuments,
  requestOffPlanApprovalFee,
  updateOffPlanAgencyAgreement,
}
