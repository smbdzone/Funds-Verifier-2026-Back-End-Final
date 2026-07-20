import User from '../models/dealHunterModel.js'
import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import Boat from '../models/boatModel.js'
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
import { buildListingIdQuery } from '../utils/listingIdLookup.js'
import {
  blockPriceChangeIfUnderProcess,
  stripUnderProcessFromListingPayload,
} from '../utils/listingUnderProcess.js'
import express from 'express'
import upload from '../middlewares/Multer.js'

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
import UserPaymentDetails from '../models/UserPaymentDetails.js'
import { AddPaymentJob } from '../utils/jobs/index.js'
import { PUBLIC_BOAT_FIELDS } from '../constants/publicFields.js'
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

// create product
const createProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  const user = req.user

  try {
    // Create the new Boat
    if (req.body.title) {
      req.body.slug = slugify(req.body.title)
    }

    if (!req.body.price) {
      return res.status(400).json({ message: 'Price of an asset is required.' })
    }
    req.body.listing = AssetsListingsPricing({
      type: 'boat',
      listing: req.body.listing || 'Public',
      price: req.body.price,
    })

    stripNullPremiumRefs(req.body)

    const createPdt = await Boat.create([req.body], { session })

    const paidViaClozer =
      req.body?.payment_provider === 'clozer' ||
      Boolean(req.body?.clozer_transaction_id)

    if (!paidViaClozer) {
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
          assetId: createPdt?.[0]?._id,
          assetType: 'boat',
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

    try {
      await notifyEvaluatorsNewListing({
        message: `New asset boat (${createPdt[0]?.title}) added for evaluation.`,
        assetType: createPdt[0]?.assetType || 'boat',
        relatedId: createPdt[0]?._id,
        relatedUUID: createPdt[0]?.uuid,
      })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (pendingRequest || pendingReport) {
      // If a pending request was found, return it along with the created product
      await session.commitTransaction()
      res.json({
        boat: createPdt[0],
        updatedRequest: pendingRequest || 'No pending request found',
        updatedReport: pendingReport || 'No pending report found',
      })
    } else {
      // If no pending request was found, just return the created product
      await session.commitTransaction()
      res.json({
        boat: createPdt[0],
        message:
          'Boat created successfully, but no pending 3D request or no pending report was found to update.',
      })
    }
  } catch (err) {
    await session.abortTransaction()
    res.status(500).json({
      message: 'Error creating boat or updating request or updating report',
      error: err.message,
    })
  } finally {
    session.endSession()
  }
})
const pickFields = (obj, fields) => {
  return fields.reduce((acc, field) => {
    if (obj[field] !== undefined) acc[field] = obj[field]
    return acc
  }, {})
}

// const createProduct = asyncHandler(async (req, res) => {
//   try {
//     if (req.body.title) {
//       req.body.slug = slugify(req.body.title);
//     }
//     const createPdt = await Boat.create(req.body);
//     res.json(createPdt);
//   } catch (err) {
//     throw new Error(err);
//   }
//   console.log("create product in working");
// });

// get single product by id or slug
const getSingleProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'Invalid boat ID' })
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
    const boat = await Boat.findOne(lookupQuery)
      .populate('pictures')
      .populate('video')
      .populate('uploadDocument')
      .populate(REQUEST_DOCUMENT_POPULATE)
      .populate('thumbnailImg')
      .populate('video3DWalkthrough')
      .populate('transactionDepositDocument')
      .populate('transactionId')
      .populate('userId')
      .populate({
        path: 'technicalReport',
        populate: {
          path: 'reportFile',
        },
      })
      .populate('evaluationCertificate')
      .lean() // 🔑 IMPORTANT

    if (!boat) {
      return res.status(404).json({ message: 'Boat not found' })
    }

    boat.requestDocument = normalizeRequestDocumentList(boat.requestDocument)

    await refreshListingMediaSignedUrls(boat)

    const isPrivilegedUser =
      req.user &&
      ['Admin', 'AssetHolder', 'Evaluator', 'Sub-Evaluator'].includes(
        req.user.role,
      )

    // Public user → return limited fields
    if (!isPrivilegedUser) {
      const publicBoat = pickFields(boat, PUBLIC_BOAT_FIELDS.trim().split(/\s+/))
      sanitizeListingMediaResponse(publicBoat)
      sanitizeUnpaidPremiumServicesForClient(publicBoat)
      return res.json(publicBoat)
    }

    await attachDocumentSignedUrls(boat)
    await attachRequestDocumentSignedUrls(boat)
    sanitizeListingMediaResponse(boat)
    await refreshListingPremiumFieldsForEdit(boat)
    res.json(boat)
  } catch (err) {
    console.error('Error fetching boat:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
})

// get single product by slug
const getSingleProductBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params

  // Check privileged roles
  const isPrivilegedUser =
    req.user &&
    ['AssetHolder', 'Admin', 'Evaluator', 'Sub-Evaluator'].includes(
      req.user.role,
    )

  try {
    const boat = await Boat.findOne({ slug, isDeleted: false })
      .select(isPrivilegedUser ? '' : PUBLIC_BOAT_FIELDS)
      .populate('pictures')
      .populate('video')
      .populate('thumbnailImg')
      .populate('video3DWalkthrough')

    if (!boat) {
      return res.status(404).json({ message: 'Boat not found' })
    }

    const boatObj = typeof boat.toObject === 'function' ? boat.toObject() : boat
    await refreshListingMediaSignedUrls(boatObj)
    sanitizeListingMediaResponse(boatObj)

    res.json(boatObj)
  } catch (err) {
    console.error('Error fetching boat:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
})

// // get all product
const getAllProduct = asyncHandler(async (req, res) => {
  try {
    /* ----------------------------------------------------
       1️⃣ AUTH — use optionalAuthMiddleware (Bearer + accessToken cookie)
    ---------------------------------------------------- */
    const user = req.user || null

    /* ----------------------------------------------------
       2️⃣ SAFE FILTER PARAMS (no raw req.query spread)
    ---------------------------------------------------- */
    const parseData = {
      ...pickScalarFilters(req.query),
    }

    /* ----------------------------------------------------
       3️⃣ COMMON FILTERS
    ---------------------------------------------------- */
    // Price range
    if (req.query.minPrice || req.query.maxPrice) {
      parseData.price = {}
      if (req.query.minPrice) parseData.price.$gte = +req.query.minPrice
      if (req.query.maxPrice) parseData.price.$lte = +req.query.maxPrice
    }

    // Date filter
    if (req.query.date) {
      const date = new Date(req.query.date)
      parseData.evaluationDateTime = {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lte: new Date(date.setHours(23, 59, 59, 999)),
      }
    }

    // Status
    applyListingStatusFilters(parseData, req.query)
    applyEvaluatorPendingFilter(parseData, req.query)

    // Title search
    const titleFilter = getSafeTitleRegex(req.query)
    if (titleFilter) {
      parseData.title = titleFilter
    }

    /* ----------------------------------------------------
       4️⃣ VISIBILITY RULES (🔥 MOST IMPORTANT)
    ---------------------------------------------------- */
    if (!user) {
      // PUBLIC USER
      parseData.listing = { $regex: /^public$/i }
    } else {
      const isSubEvaluator = ['Sub-Evaluator', 'SubEvaluator'].includes(
        user.role
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

      // AUTHENTICATED USER
      if (
        !isSubEvaluator &&
        user.role?.toLowerCase() === 'assetholder' &&
        req.query.dashboard === 'true'
      ) {
        parseData.userUUID = user.uuid
        delete parseData.listing
      } else if (!isSubEvaluator) {
        const roleNorm = String(user.role || '')
          .trim()
          .toLowerCase()
          .replace(/[\s_-]/g, '')
        const isElevatedModerator =
          ['Admin', 'Evaluator', 'Trustee'].includes(user.role) ||
          roleNorm === 'superadmin'
        if (isElevatedModerator) {
          delete parseData.listing
        } else if (
          user.role === 'DealHunter' &&
          user.financialInfo?.status === 'Approved'
        ) {
          parseData.$or = [
            { listing: { $regex: /^public$/i } },
            {
              listing: { $regex: /^private$/i },
              price: { $lte: Number(user.financialInfo.fundsVerification) },
            },
          ]
          delete parseData.listing
        } else {
          parseData.listing = { $regex: /^public$/i }
        }
      }
    }

    // Safe delete filter
    parseData.$and = [
      ...(parseData.$and || []),
      {
        $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
      },
    ]

    /* ----------------------------------------------------
       6️⃣ QUERY
    ---------------------------------------------------- */
    let query = Boat.find(parseData)
      .populate({ path: 'pictures', select: '-_id' })
      .populate({ path: 'video', select: '-_id' })
      .populate({ path: 'thumbnailImg', select: '-_id' })
      .populate({ path: 'video3DWalkthrough', select: '-_id' })
      .populate({ path: 'evaluationCertificate', select: '-_id' })
      .populate({
        path: 'technicalReport',
        select: '-_id',
        populate: { path: 'reportFile', select: '-_id' },
      })
      .populate({
        path: 'ratings.postedBy',
        select: '-_id',
      })

    if (user) {
      query = query
        .populate({ path: 'uploadDocument', select: '-_id' })
        .populate(REQUEST_DOCUMENT_POPULATE)
        .populate({ path: 'invoice', select: '-_id' })
        .populate({ path: 'evaluator', select: 'name displayName uuid' })
    }

    query = user ? query.select('-__v') : query.select(PUBLIC_BOAT_FIELDS)

    /* ----------------------------------------------------
       7️⃣ SORTING
    ---------------------------------------------------- */
    if (req.query.sort) {
      query = query.sort(req.query.sort.split(',').join(' '))
    } else {
      query = query.sort('-createdAt')
    }

    /* ----------------------------------------------------
       8️⃣ PAGINATION (SAFE DEFAULTS)
    ---------------------------------------------------- */
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    const total = await Boat.countDocuments(parseData)
    query = query.skip(skip).limit(limit)

    const productsRaw = await query
    const products = productsRaw.map((p) =>
      typeof p.toObject === 'function' ? p.toObject() : p,
    )
    await refreshListingsMediaSignedUrls(products)
    await Promise.all(
      products.map((p) =>
        user
          ? attachDocumentSignedUrls(p)
          : attachDocumentSignedUrls(p, {
            fields: ['evaluationCertificate', 'technicalReport'],
          }),
      ),
    )
    sanitizeListingsMediaResponse(products)

    /* ----------------------------------------------------
       9️⃣ RESPONSE
    ---------------------------------------------------- */
    return res.json({
      products,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      limit,
      totalProducts: total,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      message: err.message || 'Something went wrong',
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
  // Title filtering
  if (req.query.brands) {
    const brands = getSafeStringParam(req.query, 'brands')
    if (brands) {
      modifiedQuery.brands = { $regex: brands, $options: 'i' }
    }
  }

  // Facility filtering (assuming "facilities" is a field in the Property model)
  if (req.query.extras) {
    const desiredExtras = req.query.extras.split(',')
    if (req.query.allextras) {
      modifiedQuery.extras = { $all: desiredExtras }
    } else {
      modifiedQuery.extras = { $in: desiredExtras }
    }
  }

  if (req.query.exteriorColor) {
    const desiredExteriorColor = req.query.exteriorColor.split(',')
    if (req.query.allExteriorColor) {
      modifiedQuery.exteriorColor = { $all: desiredExteriorColor }
    } else {
      modifiedQuery.exteriorColor = { $in: desiredExteriorColor }
    }
  }

  if (req.query.interiorColor) {
    const desiredInteriorColor = req.query.interiorColor.split(',')
    if (req.query.allinteriorColor) {
      modifiedQuery.interiorColor = { $all: desiredInteriorColor }
    } else {
      modifiedQuery.interiorColor = { $in: desiredInteriorColor }
    }
  }
  modifiedQuery.status = 1
  modifiedQuery.isDeleted = false

  let query = Boat.find(modifiedQuery)
    .populate('pictures')
    .populate('video')
    .populate('thumbnailImg')
    .populate('evaluationCertificate')
    .populate('invoice')
    .populate('uploadDocument')
    .populate('video3DWalkthrough')
    .populate('transactionId')
    .populate('dealhunterId')
    .populate({
      path: 'technicalReport', // Populate `technicalReport`
      populate: {
        path: 'reportFile', // Within `technicalReport`, populate `reportFile`
      },
    })

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ')
    query = query.sort(sortBy)
  } else {
    query = query.sort('-createdAt')
  }

  // Field selection
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ')
    query = query.select(fields)
  } else {
    query = query.select('-__v')
  }

  // Pagination
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const skip = (page - 1) * limit
  query = query.skip(skip).limit(limit)

  const productCount = await Boat.countDocuments(modifiedQuery) // Count documents based on filters
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
    return res.status(200).json({
      products: allProduct,
      currentPage: page,
      totalPages: Math.ceil(productCount / limit),
      limit: req?.query?.limit ? parseFloat(req?.query?.limit) : 10,
      totalProducts: productCount,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ error: true, message: err?.message || 'Internal error!' })
  }
})

// get related product

const getRelatedProduct = asyncHandler(async (req, res) => {
  const { assetType, country, city, make, price } = req.body

  // Construct the query object based on provided properties
  const queryObj = {}
  if (assetType) queryObj.assetType = assetType
  if (country) queryObj.country = country
  if (city) queryObj.city = city
  if (make) queryObj.make = make
  if (price) queryObj.price = price
  queryObj.isDeleted = false
  try {
    // Execute the query with the constructed query object
    const allProduct = await Boat.find(queryObj).select('-_id')
    sanitizeListingsMediaResponse(allProduct)
    res.json(allProduct)
  } catch (err) {
    // Handle errors appropriately
    throw new Error(err)
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
      // validateMongoId(id)
      // Find the existing product
      const product = await Boat.findOne(buildListingIdQuery(moduleId)).populate(
        'uploadDocument',
      )
      if (!product) {
        return res.status(404).json({ message: 'boat not found' })
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

      // Handle technicalReport upload
      if (req.files && req.files.technicalReport) {
        req.body.technicalReport = req.files.technicalReport[0].path
      }

      // // Handle evaluationCertificate upload
      // if (req.files && req.files.evaluationC) {
      //   req.body.evaluationC = req.files.evaluationC[0].path;
      // }

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
      stripNullPremiumRefs(req.body)
      updatedProduct = await Boat.findByIdAndUpdate(
        product._id,
        { $set: req.body },
        { new: true }
      ).select('-_id')

      try {
        if (requestedDocumentsUpdated) {
          await notifyAssetHolderDocumentRequested({
            listing: updatedProduct,
            assetType: 'boat',
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
            assetType: 'boat',
            evaluator: req.user,
          })
        } else {
          const NotificationData = {
            userUUID: updatedProduct?.userUUID,
            UserRole: 'AssetHolder',
            title: 'Assets Boat',
            message: `Your boat (${updatedProduct?.title}) has been updated.`,
            RelateRoute: 'boat',
            RelatedId: updatedProduct?._id,
          }
          if (documentFulfilled) {
            NotificationData.UserRole = 'Evaluator'
            NotificationData.userUUID = updatedProduct?.evaluatorUUID
            NotificationData.message = `Seller uploaded a requested document for boat (${updatedProduct?.title}).`
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
        message: 'An error occurred while updating the boat',
        error: err.message,
      })
    }
  })
})
// const updateProduct = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   validateMongoId(id);
//   try {
//     if (req.body.title) {
//       req.body.slug = slugify(req.body.title);
//     }
//     const upProduct = await Boat.findByIdAndUpdate(id, req.body, { new: true });
//     res.json(upProduct);
//   } catch (err) {
//     throw new Error(err);
//   }
// });

// delete product
const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    // validateMongoId(id)

    const boat = await Boat.findOne({ uuid: id, isDeleted: false })

    if (!boat || boat.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Boat not found or already deleted' })
    }

    // Soft delete
    boat.isDeleted = true
    boat.deletedAt = new Date()
    await boat.save()

    // Send notification
    try {
      const NotificationData = {
        userId: boat.userId,
        userUUID: boat.userUUID,
        UserRole: 'AssetHolder',
        title: 'Assets Boat',
        message: `Your asset boat (${boat.title}) has been deleted.`,
        RelateRoute: 'boat',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.json({ message: 'Boat soft-deleted successfully', boat })
  } catch (err) {
    return res.status(500).json({ message: err.message })
  }
})

const addToWishList = asyncHandler(async (req, res) => {
  const { id } = req.user
  const { prodId } = req.body
  try {
    const user = await User.findById(id, { isDeleted: false })
    const allreadyAdd = user.wishlist.find((id) => id.toString() === prodId)
    if (allreadyAdd) {
      const user = await User.findByIdAndUpdate(
        id,
        { $pull: { wishlist: prodId } },
        { new: true }
      )
      res.json(user)
    } else {
      const user = await User.findByIdAndUpdate(
        id,
        { $push: { wishlist: prodId } },
        { new: true }
      )
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
    const product = await Boat.findOne({ uuid: prodId, isDeleted: false })
    let allreadyRated = product.ratings.find(
      (rating) => rating.postedBy.toString() === id.toString()
    )
    if (allreadyRated) {
      const updateRating = await Boat.updateOne(
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
      const rateProduct = await Boat.findByIdAndUpdate(
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
        }
      )
    }
    const getallrating = await Boat.findById(product._id, { isDeleted: false })
    let totalRating = getallrating.ratings.length
    let ratingSum = getallrating.ratings
      .map((item) => item.star)
      .reduce((prev, current) => prev + current, 0)
    let actualRating = Math.round(ratingSum / totalRating)
    const finalProduct = await Boat.findByIdAndUpdate(
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
    const priceAggregation = await Boat.aggregate([
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
    console.log(priceAggregation)

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

    const metrics = await Boat.aggregate([
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
    // Keep error logging for debugging
    console.log(error)
  }
}

export {
  createProduct,
  getSingleProduct,
  getAllProduct,
  updateProduct,
  deleteProduct,
  addToWishList,
  addRating,
  uploadImgs,
  deleteImgs,
  getRelatedProduct,
  getSingleProductBySlug,
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
}
