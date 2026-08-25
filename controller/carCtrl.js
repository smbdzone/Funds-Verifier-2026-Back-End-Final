// import User from "../models/userModel.js";
import asyncHandler from 'express-async-handler'
import Car from '../models/carModel.js'
import Request3D from '../models/request3DModel.js'
import Report from '../models/reportModel.js'
import mongoose from 'mongoose'
import slugify from 'slugify'
import {
  uploadImageToS3,
  deleteFileFromS3,
} from '../services/s3UploadService.js'
import { getBuckets } from '../utils/awsConfig.js'
import {
  cloudFrontUrlForKey,
  generateCloudFrontSignedUrl,
} from '../services/cloudFrontSignedUrlService.js'
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
  attachListingSellerContact,
} from '../helper/listingSellerInfo.js'
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
import { sanitizeListingMediaObjectIds } from '../utils/sanitizeListingMediaIds.js'
import { buildListingIdQuery } from '../utils/listingIdLookup.js'
import { isListingPrivilegedUser } from '../utils/parentEvaluator.js'
import {
  blockPriceChangeIfUnderProcess,
  stripUnderProcessFromListingPayload,
} from '../utils/listingUnderProcess.js'
import { restrictAssetHolderBodyAfterApproval } from '../utils/listingEditLock.js'
import upload from '../middlewares/Multer.js'
import express from 'express'

import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
import processQuery from '../utils/priceRange.js'
import { verifyToken } from '../middlewares/JwtAuth.js'
import UserModel from '../models/userModel.js'
import { AssetsListingsPricing } from '../utils/AssetsListingsPricing.js'
import { createNotification } from './notifications.controller.js'
import { notifyEvaluatorsNewListing } from '../helper/notificationHelpers.js'
import { notifyAssetHolderDocumentRequested } from '../helper/notifyDocumentRequested.js'
import {
  listingBecameEvaluatorApproved,
  notifyAssetHolderListingApproved,
} from '../helper/notifyAssetHolderListingEvents.js'
import { AddPaymentJob } from '../utils/jobs/index.js'
import UserPaymentDetails from '../models/UserPaymentDetails.js'
import { PUBLIC_CAR_FIELDS } from '../constants/publicFields.js'
import {
  applyCardListPopulates,
  CARD_CAR_FIELDS,
  computeCardRatingFields,
  shouldUseCardListProjection,
} from '../utils/listingCardQuery.js'
import { findRelatedListings } from '../utils/relatedListings.js'
import {
  getSafeStringParam,
  getSafeTitleRegex,
  pickScalarFilters,
  applyListingStatusFilters,
  applyEvaluatorPendingFilter,
} from '../utils/listingQuery.js'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

app.use(express.static(path.join(__dirname, 'public')))
const pickFields = (obj, fields) => {
  return fields.reduce((acc, field) => {
    if (obj[field] !== undefined) acc[field] = obj[field]
    return acc
  }, {})
}

// create product
const createProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  const user = req.user

  try {
    // Create the new Car
    if (req.body.title) {
      req.body.slug = slugify(req.body.title)
    }
    if (!req.body.price) {
      return res.status(400).json({ message: 'Price of an asset is required.' })
    }
    req.body.listing = AssetsListingsPricing({
      type: 'car',
      listing: req.body.listing || 'Public',
      price: req.body.price,
    })

    if (req.body.bodyType && !req.body.carType) {
      req.body.carType = req.body.bodyType
    }

    stripNullPremiumRefs(req.body)
    sanitizeListingMediaObjectIds(req.body)

    const createPdt = await Car.create([req.body], { session })

    const paidViaClozer =
      req.body?.payment_provider === 'clozer' ||
      Boolean(req.body?.clozer_transaction_id)

    if (!paidViaClozer) {
      try {
        const PaymentDetails = await UserPaymentDetails.create({
          userId: user?._id,
          userUUID: user?.uuid,
          assetTitle: createPdt?.[0]?.title,
          assetType: 'property',
          customerId: req?.body?.customerId,
          paymentMethod: req?.body?.paymentMethod,
        })
        await AddPaymentJob({
          jobId: PaymentDetails?._id,
          assetId: createPdt?.[0]?._id,
          assetType: 'car',
          PaymentDetailsId: PaymentDetails?._id,
          userId: createPdt?.[0]?.userId,
        })
      } catch (error) {
        console.log(`Error adding job to queue: ${error.message}`)
      }
    }

    // Try to find and update the latest pending 3D Request
    const pendingRequest = await Request3D.findOneAndUpdate(
      { status: 'pending', isDeleted: { $ne: true } },
      {
        productId: createPdt[0]._id,
        productUUID: createPdt[0].uuid,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
      },
      { new: true, sort: { createdAt: -1 }, session }
    )
    const pendingReport = await Report.findOneAndUpdate(
      { status: 'pending', isDeleted: { $ne: true } },
      {
        productId: createPdt[0]._id,
        productUUID: createPdt[0].uuid,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
      },
      { new: true, sort: { createdAt: -1 }, session }
    )

    if (pendingRequest || pendingReport) {
      // If a pending request was found, return it along with the created product
      await session.commitTransaction()
      res.json({
        car: createPdt[0],
        updatedRequest: pendingRequest || 'No pending request found',
        updatedReport: pendingReport || 'No pending report found',
      })
    } else {
      // If no pending request was found, just return the created product
      await session.commitTransaction()
      res.json({
        car: createPdt[0],
        message:
          'Car created successfully, but no pending 3D request or but no pending 3D report was found to update.',
      })
    }

    try {
      await notifyEvaluatorsNewListing({
        message: `New Car (${createPdt[0]?.title}) added for evaluation.`,
        assetType: createPdt[0]?.assetType || 'car',
        relatedId: createPdt[0]?._id,
        relatedUUID: createPdt[0]?.uuid,
        listing: createPdt[0],
        assetHolder: user,
      })
    } catch (error) {
      console.log({ error: error?.message })
    }
  } catch (err) {
    await session.abortTransaction()
    res.status(500).json({
      message: 'Error creating car or updating request or updating Report',
      error: err.message,
    })
  } finally {
    session.endSession()
  }
})

// get single product by id or slug
const getSingleProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'Invalid car ID' })
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
    const car = await Car.findOne(lookupQuery)
      .populate('pictures')
      .populate('video')
      .populate('thumbnailImg').populate('qrScan')
      .populate('video3DWalkthrough')
      .populate('uploadDocument')
      .populate(REQUEST_DOCUMENT_POPULATE)
      .populate('transactionDepositDocument')
      .populate('transactionId')
      .populate('userId')
      .populate('dealhunterId')
      .populate({
        path: 'technicalReport',
        populate: { path: 'reportFile' },
      })
      .populate('evaluationCertificate')
      .lean()

    if (!car) {
      return res.status(404).json({ message: 'Car not found' })
    }

    car.requestDocument = normalizeRequestDocumentList(car.requestDocument)

    await refreshListingMediaSignedUrls(car)

    const isPrivilegedUser = isListingPrivilegedUser(req.user)

    if (!isPrivilegedUser) {
      recordListingClick(Car, car)
      await attachDocumentSignedUrls(car, {
        fields: ['evaluationCertificate', 'technicalReport'],
      })
      const publicCar = pickFields(car, PUBLIC_CAR_FIELDS.trim().split(/\s+/))
      const sellersByUuid = await getListingSellersByUuid([car])
      const seller = resolveListingSeller(car, sellersByUuid)
      if (seller) {
        publicCar.sellerRef = getSellerRef(seller)
      }
      sanitizeListingMediaResponse(publicCar)
      sanitizeUnpaidPremiumServicesForClient(publicCar)
      return res.json(publicCar)
    }

    await attachDocumentSignedUrls(car)
    await attachRequestDocumentSignedUrls(car)
    sanitizeListingMediaResponse(car)
    await refreshListingPremiumFieldsForEdit(car)
    await attachListingSellerContact(car)
    res.json(car)
  } catch (err) {
    console.error('Error fetching car:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
})

// get single product by Slug
const getSingleProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params

  try {
    const singleProduct = await Car.find({ slug, isDeleted: false }).select(
      '-_id'
    )
    sanitizeListingsMediaResponse(singleProduct)
    res.json(singleProduct)
  } catch (err) {
    throw new Error(err)
  }
})

// // get all product
const getAllProduct = asyncHandler(async (req, res) => {
  // ---------------- AUTH — optionalAuthMiddleware (Bearer + cookie) ----------------
  const user = req.user || null
  const isAuthenticated = !!user

  // ---------------- SAFE FILTER PARAMS ----------------
  const parseData = {
    ...pickScalarFilters(req.query),
  }

  // ---------------- PUBLIC DEFAULT ----------------
  parseData.isDeleted = false
  parseData.listing = 'Public' // 🔐 DEFAULT SAFE MODE

  // ---------------- FILTERS ----------------
  if (req.query.minPrice || req.query.maxPrice) {
    parseData.price = {}
    if (req.query.minPrice) parseData.price.$gte = +req.query.minPrice
    if (req.query.maxPrice) parseData.price.$lte = +req.query.maxPrice
  }

  if (req.query.title) {
    const titleFilter = getSafeTitleRegex(req.query)
    if (titleFilter) {
      parseData.title = titleFilter
    }
  }

  applyListingStatusFilters(parseData, req.query)
  applyEvaluatorPendingFilter(parseData, req.query)

  // ---------------- AUTHENTICATED LOGIC ----------------
  if (isAuthenticated) {
    const isSubEvaluator = ['Sub-Evaluator', 'SubEvaluator'].includes(user.role)

    if (isSubEvaluator) {
      parseData.$or = [{ evaluator: user._id }, { evaluatorUUID: user.uuid }]
      delete parseData.listing
    }

    const roleNorm = String(user.role || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '')
    const isElevatedModerator =
      ['Admin', 'Evaluator', 'Trustee'].includes(user.role) || roleNorm === 'superadmin'

    if (!isSubEvaluator && isElevatedModerator) {
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

    // DealHunter approved
    if (
      !isSubEvaluator &&
      user.role === 'DealHunter' &&
      user.financialInfo?.status === 'Approved'
    ) {
      parseData.$or = [
        { listing: 'Public' },
        {
          listing: 'Private',
          price: { $lte: Number(user.financialInfo.fundsVerification) },
        },
      ]
      delete parseData.listing
    }
  }

  // ---------------- QUERY BUILD ----------------
  let query = Car.find(parseData)
  const useCardProjection = shouldUseCardListProjection(req, isAuthenticated)

  if (useCardProjection) {
    query = query.select(CARD_CAR_FIELDS)
    query = applyCardListPopulates(query)
  } else {
    // 🔐 FIELD SELECTION
    if (!isAuthenticated) {
      query = query.select(PUBLIC_CAR_FIELDS)
    } else {
      query = query.select('-__v')
    }

    // 🔐 SAFE POPULATES
    query = query
      .populate({ path: 'pictures', select: 'images uuid' })
      .populate({ path: 'video', select: '-_id' })
      .populate({ path: 'thumbnailImg', select: '-_id' })
      .populate({ path: 'qrScan', select: '-_id' })
      .populate({ path: 'evaluationCertificate', select: '-_id' })
      .populate({ path: 'video3DWalkthrough', select: '-_id' })
      .populate({ path: 'userId', select: 'profileImage name uuid' })
      .populate({
        path: 'technicalReport',
        populate: { path: 'reportFile', select: '-_id' },
      })

    if (isAuthenticated) {
      query = query
        .populate({ path: 'uploadDocument', select: '-_id' })
        .populate(REQUEST_DOCUMENT_POPULATE)
        .populate({ path: 'invoice', select: '-_id' })
        .populate({ path: 'evaluator', select: 'name displayName uuid' })
        .populate({ path: 'ratings.postedBy', select: '-_id' })
    }
  }

  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ')
    query = query.sort(sortBy)
  } else {
    query = query.sort('-createdAt')
  }

  // ---------------- PAGINATION ----------------
  const page = +req.query.page || 1
  const limit = +req.query.limit || 10
  const skip = (page - 1) * limit

  const total = await Car.countDocuments(parseData)
  const products = await query.skip(skip).limit(limit)

  // Post-find hook on Car model already refreshed signed URLs on populated
  // media; re-run as a safety net for non-hooked paths (e.g. legacy lean).
  await refreshListingsMediaSignedUrls(products)

  const sellersByUuid = await getListingSellersByUuid(products)

  // ---------------- RESPONSE SANITIZATION ----------------
  const finalProducts = await Promise.all(
    products.map(async (product) => {
      const obj = product.toObject()
      const { reviewCount, averageRating } = computeCardRatingFields(obj)

      // ratings → stars only for public
      if (!isAuthenticated && Array.isArray(obj.ratings)) {
        obj.ratings = obj.ratings.map((r) => ({ star: r.star }))
      }

      // Seller avatar for cards; strip other user fields for public callers
      const seller = resolveListingSeller(obj, sellersByUuid)
      if (seller) {
        obj.sellerAvatar = seller.profileImage || ''
        obj.sellerName = seller.name || ''
        obj.sellerRef = getSellerRef(seller)
        if (!isAuthenticated) {
          obj.userId = {
            profileImage: seller.profileImage || '',
            name: seller.name || '',
          }
        }
      }

      if (!useCardProjection) {
        if (isAuthenticated) {
          await attachDocumentSignedUrls(obj)
        } else {
          await attachDocumentSignedUrls(obj, {
            fields: ['evaluationCertificate', 'technicalReport'],
          })
        }
      }

      // Drop server-internal S3 metadata (s3Bucket/s3Key/s3VersionId/s3ETag/url)
      // — signedUrl is the only URL the client needs.
      sanitizeListingMediaResponse(obj)

      return {
        ...obj,
        reviewCount,
        averageRating,
      }
    }),
  )

  res.json({
    products: finalProducts,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    limit,
    totalProducts: total,
  })
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
  if (req.query.extras) {
    const desiredExtras = req.query.extras.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allextras) {
      // Find properties with ALL specified extras
      modifiedQuery.extras = { $all: desiredExtras }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.extras = { $in: desiredExtras }
    }
  }

  if (req.query.exteriorColor) {
    const desiredExteriorColor = req.query.exteriorColor.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allExteriorColor) {
      // Find properties with ALL specified exteriorColor
      modifiedQuery.exteriorColor = { $all: desiredExteriorColor }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.exteriorColor = { $in: desiredExteriorColor }
    }
  }

  if (req.query.interiorColor) {
    const desiredInteriorColor = req.query.interiorColor.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allinteriorColor) {
      // Find properties with ALL specified interiorColor
      modifiedQuery.interiorColor = { $all: desiredInteriorColor }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.interiorColor = { $in: desiredInteriorColor }
    }
  }

  if (req.query.technicalFeatures) {
    const desiredTechnicalFeatures = req.query.technicalFeatures.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allTechnicalFeatures) {
      // Find properties with ALL specified technicalFeatures
      modifiedQuery.technicalFeatures = { $all: desiredTechnicalFeatures }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.technicalFeatures = { $in: desiredTechnicalFeatures }
    }
  }
  modifiedQuery.status = 1
  modifiedQuery.isDeleted = false
  let query = Car.find(modifiedQuery)
    .populate('pictures')
    .populate('video')
    .populate('thumbnailImg').populate('qrScan')
    .populate('uploadDocument')
    .populate('evaluationCertificate')
    .populate('invoice')
    .populate('video3DWalkthrough')
    .populate({
      path: 'technicalReport', // Populate `technicalReport`
      populate: {
        path: 'reportFile', // Within `technicalReport`, populate `reportFile`
      },
    })

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
    query = query.select('-__v')
  }

  // pagination
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  query = query.skip(skip).limit(limit)
  const productCount = await Car.countDocuments()
  if (skip >= productCount) {
    return res
      .status(400)
      .json({ message: 'Assets on this page does not exist' })
  }

  try {
    const allProductRaw = await query
    const allProduct = allProductRaw.map((p) =>
      typeof p.toObject === 'function' ? p.toObject() : p,
    )
    await refreshListingsMediaSignedUrls(allProduct)
    await Promise.all(
      allProduct.map((p) =>
        userId
          ? attachDocumentSignedUrls(p)
          : attachDocumentSignedUrls(p, {
            fields: ['evaluationCertificate', 'technicalReport'],
          }),
      ),
    )
    sanitizeListingsMediaResponse(allProduct)
    const totalFilteredProducts = await Car.countDocuments(modifiedQuery)

    return res.status(200).json({
      products: allProduct,
      currentPage: page,
      totalPages: Math.ceil(totalFilteredProducts / limit),
      limit: req?.query?.limit ? parseFloat(req?.query?.limit) : 10,
      totalProducts: totalFilteredProducts,
    })
    // return res.status(200).json(allProduct);
  } catch (err) {
    return res
      .status(500)
      .json({ error: true, message: err?.message || 'Internal error!' })
  }
})

// get Related product

const getRelatedProduct = asyncHandler(async (req, res) => {
  try {
    const result = await findRelatedListings({
      Model: Car,
      cardFields: CARD_CAR_FIELDS,
      query: req.query,
      softFields: ['assetType', 'country', 'city', 'model', 'make'],
    })
    return res.status(200).json(result)
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'Server error' })
  }
})

// get update product
const updateProduct = asyncHandler(async (req, res) => {
  const { moduleId } = req.params

  // Handle multiple file uploads (technicalReport, evaluationC, and uploadDocument)
  upload.fields([
    { name: 'technicalReport', maxCount: 1 },
    { name: 'evaluationCertificate', maxCount: 1 },
    { name: 'uploadDocument', maxCount: 100 },
  ])(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message })
    }

    try {
      // Find the existing product
      const product = await Car.findOne(buildListingIdQuery(moduleId)).populate(
        'uploadDocument',
      )
      if (!product) {
        return res.status(404).json({ message: 'car not found' })
      }

      stripUnderProcessFromListingPayload(req.body)
      const priceBlock = blockPriceChangeIfUnderProcess(product, req.body)
      if (priceBlock) {
        return res.status(403).json({ message: priceBlock })
      }

      req.body = restrictAssetHolderBodyAfterApproval(
        product,
        req.body,
        req.user,
      )

      if (req.body.bodyType && !req.body.carType) {
        req.body.carType = req.body.bodyType
      }

      // Update slug if title is provided
      if (req.body.title) {
        req.body.slug = slugify(req.body.title)
      }

      const documentFulfilled = Boolean(req.body.fulfillRequestDocument)
      applyRequestDocumentUpdate(product, req.body)

      const requestedDocumentsUpdated =
        Boolean(req.body.requestDocument) && !documentFulfilled

      // Handle technicalReport upload
      if (req.files && req.files.technicalReport) {
        req.body.technicalReport = req.files.technicalReport[0].path
      }

      // Handle evaluationCertificate upload
      if (req.files && req.files.evaluationC) {
        req.body.evaluationC = req.files.evaluationC[0].path
      }

      // Handle uploadDocument IDs (from frontend)
      if (req.body.uploadDocument && !documentFulfilled) {
        const newDocumentIds = Array.isArray(req.body.uploadDocument)
          ? req.body.uploadDocument
          : [req.body.uploadDocument]

        req.body.uploadDocument = [
          ...(product.uploadDocument || []).map((doc) => doc._id || doc),
          ...newDocumentIds,
        ]
      }

      let updatedProduct
      stripNullPremiumRefs(req.body)
      sanitizeListingMediaObjectIds(req.body)
      updatedProduct = await Car.findByIdAndUpdate(
        product._id,
        { $set: req.body },
        { new: true }
      ).select('-_id')

      try {
        if (requestedDocumentsUpdated) {
          await notifyAssetHolderDocumentRequested({
            listing: updatedProduct,
            assetType: 'car',
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
            assetType: 'car',
            evaluator: req.user,
          })
        } else {
          const NotificationData = {
            userUUID: updatedProduct?.userUUID,
            UserRole: 'AssetHolder',
            title: 'Assets Car',
            message: `Your car (${updatedProduct?.title}) has been updated.`,
            RelateRoute: 'cars',
            RelatedId: updatedProduct?._id,
          }
          if (documentFulfilled) {
            NotificationData.UserRole = 'Evaluator'
            NotificationData.userUUID = updatedProduct?.evaluatorUUID
            NotificationData.message = `Seller uploaded a requested document for car (${updatedProduct?.title}).`
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
        message: 'An error occurred while updating the car',
        error: err.message,
      })
    }
  })
})

// delete product
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    // validateMongoId(id)

    const car = await Car.findOne({ uuid: id, isDeleted: false })

    if (!car || car.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Car not found or already deleted' })
    }

    // Soft delete
    car.isDeleted = true
    car.deletedAt = new Date()
    await car.save()

    // Send notification
    try {
      const NotificationData = {
        userId: car.userId,
        userUUID: car.userUUID,
        UserRole: 'AssetHolder',
        title: 'Assets Car',
        message: `Your car (${car.title}) has been deleted.`,
        RelateRoute: 'cars',
        RelatedId: car._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.json({ message: 'Car deleted successfully', car })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
})

const addRating = asyncHandler(async (req, res, next) => {
  // const { id } = req.user;
  const { star, prodId, comment, id } = req.body
  try {
    const product = await Car.findOne({ uuid: prodId, isDeleted: false })
    let allreadyRated = product.ratings.find(
      (rating) => rating.postedBy.toString() === id.toString()
    )
    if (allreadyRated) {
      const updateRating = await Car.updateOne(
        {
          ratings: { $elemMatch: allreadyRated },
        },
        {
          $set: { 'ratings.$.star': star, 'ratings.$.comment': comment },
        },
        {
          new: true,
        }
      )
    } else {
      const rateProduct = await Car.findByIdAndUpdate(
        product._id,
        { isDeleted: false },
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
        }
      )
    }
    const getallrating = await Car.findById(prodId, { isDeleted: false })
    let totalRating = getallrating.ratings.length
    let ratingSum = getallrating.ratings
      .map((item) => item.star)
      .reduce((prev, current) => prev + current, 0)
    let actualRating = Math.round(ratingSum / totalRating)
    const finalProduct = await Car.findByIdAndUpdate(
      product._id,
      {
        totalrating: actualRating,
      },
      {
        new: true,
      }
    )
    res.json(finalProduct)
  } catch (err) {
    throw new Error(err)
  }
})

const uploadImgs = asyncHandler(async (req, res) => {
  try {
    const userUUID = req.user?.uuid || req.query.userUUID || req.query.userId
    if (!userUUID) {
      return res.status(400).json({ error: 'User UUID is required' })
    }

    const files = req.files || []
    const images = []
    const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60 // 1 hour

    for (const file of files) {
      // Upload to S3
      const s3Result = await uploadImageToS3(file, userUUID)

      // Generate CloudFront URL
      const cloudFrontUrl = cloudFrontUrlForKey(s3Result.key)
      const signed = generateCloudFrontSignedUrl(
        s3Result.key,
        SIGNED_URL_EXPIRES_IN_SECONDS
      )

      images.push({
        s3Key: s3Result.key,
        s3Bucket: s3Result.bucket,
        cloudFrontUrl: cloudFrontUrl,
        signedUrl: signed.signedUrl,
        expiresAt: signed.expiresAt,
        expiresInSeconds: signed.expiresInSeconds,
        originalName: file.originalname,
        contentType: file.mimetype,
        size: s3Result.size,
        uploadedAt: s3Result.uploadedAt,
      })
    }

    res.json(images)
  } catch (err) {
    console.error('Error uploading images:', err)
    res.status(500).json({ error: err?.message || 'Failed to upload images' })
  }
})

const deleteImgs = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    // id can be s3Key or old Cloudinary public_id
    // If it contains '/' it's likely an S3 key, otherwise it might be old Cloudinary ID
    const buckets = getBuckets()
    const s3Key = id.includes('/') ? id : null

    if (s3Key) {
      // S3 key format - delete from S3
      await deleteFileFromS3(s3Key, buckets.images)
      res.json({ message: 'Image deleted successfully' })
    } else {
      // Old Cloudinary public_id - just return success (migration period)
      res.json({ message: 'Image deletion requested (legacy ID - migration in progress)' })
    }
  } catch (err) {
    console.error('Error deleting image:', err)
    res.status(500).json({ error: err?.message || 'Failed to delete image' })
  }
})

const getPrice = async (req, res) => {
  try {
    const priceAggregation = await Car.aggregate([
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
    res.json({ highestPrice: maxPrice, lowestPrice: minPrice })
  } catch (err) {
    console.error('Error getting prices:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

const getApprovedListingsMetrics = async (req, res) => {
  try {
    const currentMonth = new Date().getMonth() + 1
    const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
    const currentYear = new Date().getFullYear()
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear

    const metrics = await Car.aggregate([
      {
        $match: { status: 1 }, // Only approved listings
      },
      {
        $group: {
          _id: {
            year: { $year: { $toDate: '$createdAt' } },
            month: { $month: { $toDate: '$createdAt' } },
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
      (m) => m.isCurrentMonth && m.year === currentYear
    )
    const lastMonthData = metrics.find(
      (m) => m.isLastMonth && m.year === lastMonthYear
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
    console.error('Aggregation Error:', error)
    res.status(500).json({ message: 'Server Error', error: error.message })
  }
}

export {
  createProduct,
  getSingleProduct,
  getAllProduct,
  updateProduct,
  deleteProduct,
  addRating,
  uploadImgs,
  deleteImgs,
  getRelatedProduct,
  getSingleProductBySlug,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
}
