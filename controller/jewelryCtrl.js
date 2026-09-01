// import User from "../models/userModel.js";
import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import Jewelry from '../models/jewelryModel.js'
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
import { sanitizeListingMediaObjectIds, toListingUpdateOps } from '../utils/sanitizeListingMediaIds.js'
import { buildListingIdQuery } from '../utils/listingIdLookup.js'
import { isListingPrivilegedUser } from '../utils/parentEvaluator.js'
import {
  MARKETPLACE_LISTING_FILTER,
  sendLockedPrivateListingIfNeeded,
} from '../utils/listingVisibility.js'
import {
  blockPriceChangeIfUnderProcess,
  stripUnderProcessFromListingPayload,
} from '../utils/listingUnderProcess.js'
import { restrictAssetHolderBodyAfterApproval } from '../utils/listingEditLock.js'
import upload from '../middlewares/Multer.js'

import express from 'express'
import UserModel from '../models/userModel.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'
const app = express()
const PORT = 4000

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

app.use(express.static(path.join(__dirname, 'public')))

import processQuery from '../utils/priceRange.js'
import Boat from '../models/boatModel.js'
import { verifyToken } from '../middlewares/JwtAuth.js'
import { AssetsListingsPricing, applyListingVisibility } from '../utils/AssetsListingsPricing.js'
import { createNotification } from './notifications.controller.js'
import { notifyEvaluatorsNewListing } from '../helper/notificationHelpers.js'
import { notifyAssetHolderDocumentRequested } from '../helper/notifyDocumentRequested.js'
import {
  listingBecameEvaluatorApproved,
  notifyAssetHolderListingApproved,
} from '../helper/notifyAssetHolderListingEvents.js'
import UserPaymentDetails from '../models/UserPaymentDetails.js'
import { AddPaymentJob } from '../utils/jobs/index.js'
import { PUBLIC_JEWELRY_FIELDS } from '../constants/publicFields.js'
import {
  applyCardListPopulates,
  CARD_JEWELRY_FIELDS,
  computeCardRatingFields,
  shouldUseCardListProjection,
} from '../utils/listingCardQuery.js'
import { findRelatedListings } from '../utils/relatedListings.js'
import {
  getSafeTitleRegex,
  pickScalarFilters,
  applyListingStatusFilters,
  applyEvaluatorPendingFilter,
} from '../utils/listingQuery.js'

// create product
const createProduct = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  const user = req.user
  // console.log(user.uuid, req.body.userUUID)
  try {
    if (req.body.title) {
      req.body.slug = slugify(req.body.title)
    }

    if (!req.body.price) {
      return res.status(400).json({ message: 'Price of an asset is required.' })
    }
    req.body.listing = AssetsListingsPricing({
      type: 'jewelry',
      listing: req.body.listing || 'Public',
      price: req.body.price,
    })

    stripNullPremiumRefs(req.body)
    sanitizeListingMediaObjectIds(req.body)

    const createPdt = await Jewelry.create([req.body], { session })

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
          assetType: 'jewelry',
          customerId: req?.body?.customerId,
          paymentMethod: req?.body?.paymentMethod,
        })
        await AddPaymentJob({
          jobId: PaymentDetails?._id,
          assetId: createPdt?.[0]?._id,
          assetType: 'property',
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
        message: `New asset jewelry (${createPdt[0]?.title}) added for evaluation.`,
        assetType: createPdt[0]?.assetType || 'jewelry',
        relatedId: createPdt[0]?._id,
        relatedUUID: createPdt[0]?.uuid,
        listing: createPdt[0],
        assetHolder: user,
      })
    } catch (error) {
      console.log({ error: error?.message })
    }

    if (pendingRequest || pendingReport) {
      // If a pending request was found, return it along with the created product
      await session.commitTransaction()
      res.json({
        Jewelry: createPdt[0],
        updatedRequest: pendingRequest || 'No pending request found',
        updatedReport: pendingReport || 'No pending report found',
      })
    } else {
      // If no pending request was found, just return the created product
      await session.commitTransaction()
      res.json({
        Jewelry: createPdt[0],
        message:
          'Jewelry created successfully, but no pending 3D request or no pending report was found to update.',
      })
    }
  } catch (err) {
    await session.abortTransaction()
    res.status(500).json({
      message: 'Error creating Jewelry or updating request or updating report',
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

// get single product by id or slug
const getSingleProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ message: 'Invalid jewelry ID' })
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
    const jewelry = await Jewelry.findOne(lookupQuery)
      .populate('pictures')
      .populate('video')
      .populate('thumbnailImg').populate('qrScan')
      .populate('video3DWalkthrough')
      .populate('uploadDocument')
      .populate(REQUEST_DOCUMENT_POPULATE)
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
      .lean() // 🔑 REQUIRED

    if (!jewelry) {
      return res.status(404).json({ message: 'Jewelry not found' })
    }

    jewelry.requestDocument = normalizeRequestDocumentList(
      jewelry.requestDocument,
    )

    await refreshListingMediaSignedUrls(jewelry)

    if (sendLockedPrivateListingIfNeeded(res, req.user, jewelry)) {
      return
    }

    const isPrivilegedUser = isListingPrivilegedUser(req.user)

    // 🔒 Public / non-privileged users
    if (!isPrivilegedUser) {
      recordListingClick(Jewelry, jewelry)
      await attachDocumentSignedUrls(jewelry, {
        fields: ['evaluationCertificate', 'technicalReport'],
      })
      const publicJewelry = pickFields(
        jewelry,
        PUBLIC_JEWELRY_FIELDS.trim().split(/\s+/),
      )
      const sellersByUuid = await getListingSellersByUuid([jewelry])
      const seller = resolveListingSeller(jewelry, sellersByUuid)
      if (seller) {
        publicJewelry.sellerRef = getSellerRef(seller)
      }
      sanitizeListingMediaResponse(publicJewelry)
      sanitizeUnpaidPremiumServicesForClient(publicJewelry)
      return res.json(publicJewelry)
    }

    await attachDocumentSignedUrls(jewelry)
    await attachRequestDocumentSignedUrls(jewelry)
    sanitizeListingMediaResponse(jewelry)
    await refreshListingPremiumFieldsForEdit(jewelry)
    await attachListingSellerContact(jewelry)
    res.json(jewelry)
  } catch (err) {
    console.error('Error fetching jewelry:', err.message)
    res.status(500).json({ message: 'Server error' })
  }
})

// // get all product
const getAllProduct = asyncHandler(async (req, res) => {
  /* ===================== AUTH — optionalAuthMiddleware (Bearer + cookie) ===================== */
  const user = req.user || null
  const isPublicUser = !user || req.query.token === 'false'

  /* ===================== SAFE FILTER PARAMS ===================== */
  const parseData = {
    ...pickScalarFilters(req.query),
  }

  /* ===================== PRICE FILTER ===================== */
  if (req.query.minPrice || req.query.maxPrice) {
    parseData.price = {}
    if (req.query.minPrice) parseData.price.$gte = Number(req.query.minPrice)
    if (req.query.maxPrice) parseData.price.$lte = Number(req.query.maxPrice)
  }

  /* ===================== DATE FILTER ===================== */
  if (req.query.date) {
    const date = new Date(req.query.date)
    const start = new Date(date.setHours(0, 0, 0, 0))
    const end = new Date(date.setHours(23, 59, 59, 999))
    parseData.evaluationDateTime = { $gte: start, $lte: end }
  }

  /* ===================== STATUS FILTER ===================== */
  applyListingStatusFilters(parseData, req.query)
  applyEvaluatorPendingFilter(parseData, req.query)

  /* ===================== TITLE SEARCH ===================== */
  const titleFilter = getSafeTitleRegex(req.query)
  if (titleFilter) {
    parseData.title = titleFilter
  }

  /* ===================== ROLE-BASED ACCESS ===================== */
  parseData.listing = MARKETPLACE_LISTING_FILTER
  if (user) {
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

    if (
      !isSubEvaluator &&
      user.role?.toLowerCase() === 'assetholder' &&
      req.query.dashboard === 'true'
    ) {
      parseData.userUUID = user.uuid
      delete parseData.listing
    } else if (
      !isSubEvaluator &&
      user.role === 'DealHunter' &&
      user.financialInfo?.status === 'Approved'
    ) {
      parseData.listing = MARKETPLACE_LISTING_FILTER
    } else if (!isSubEvaluator && user.role === 'DealHunter') {
      parseData.listing = MARKETPLACE_LISTING_FILTER
    }
  } else {
    parseData.listing = MARKETPLACE_LISTING_FILTER
  }

  parseData.isDeleted = false

  /* ===================== BASE QUERY ===================== */
  const useCardProjection = shouldUseCardListProjection(req, !isPublicUser)
  let query = Jewelry.find(parseData)

  if (useCardProjection) {
    query = applyCardListPopulates(query).select(CARD_JEWELRY_FIELDS)
  } else {
    query = query
      .populate({ path: 'pictures', select: 'images uuid' })
      .populate({ path: 'video', select: '-_id' })
      .populate({ path: 'thumbnailImg', select: '-_id' })
      .populate({ path: 'qrScan', select: '-_id' })
      .populate({ path: 'userId', select: 'profileImage name uuid' })
      .populate({ path: 'ratings.postedBy', select: '-_id' })
      .populate({ path: 'evaluationCertificate', select: '-_id' })
      .populate({ path: 'video3DWalkthrough', select: '-_id' })
      .populate({
        path: 'technicalReport',
        select: '-_id',
        populate: { path: 'reportFile', select: '-_id' },
      })

    if (!isPublicUser) {
      query = query
        .populate({ path: 'uploadDocument', select: '-_id' })
        .populate(REQUEST_DOCUMENT_POPULATE)
        .populate({ path: 'invoice', select: '-_id' })
        .populate({ path: 'evaluator', select: 'name displayName uuid' })
        .populate({
          path: 'reviews',
          match: {
            isDeleted: false,
            $or: [{ status: 'approved' }, { status: { $exists: false } }],
          },
          select: 'ratingNumber review -_id',
        })
    }

    /* ===================== FIELD SELECTION ===================== */
    if (isPublicUser) {
      query = query.select(PUBLIC_JEWELRY_FIELDS)
    } else if (req.query.fields) {
      query = query.select(req.query.fields.split(',').join(' '))
    } else {
      query = query.select('-__v')
    }
  }

  /* ===================== SORTING ===================== */
  query = req.query.sort
    ? query.sort(req.query.sort.split(',').join(' '))
    : query.sort('-createdAt')

  /* ===================== PAGINATION ===================== */
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  const skip = (page - 1) * limit

  const totalFilteredProducts = await Jewelry.countDocuments(parseData)

  if (skip >= totalFilteredProducts && totalFilteredProducts > 0) {
    return res.status(404).json({ message: 'This page does not exist' })
  }

  query = query.skip(skip).limit(limit)

  /* ===================== EXECUTION ===================== */
  const products = await query

  // Post-find hook on Jewelry model already refreshed signed URLs on populated
  // media; re-run as a safety net for non-hooked paths (e.g. legacy lean).
  await refreshListingsMediaSignedUrls(products)

  const sellersByUuid = await getListingSellersByUuid(products)

  const modifiedProducts = await Promise.all(
    products.map(async (product) => {
      const obj = product.toObject()
      const { reviewCount, averageRating } = useCardProjection
        ? computeCardRatingFields(obj)
        : (() => {
          const count = product.reviews?.length || 0
          const avg =
            count > 0
              ? product.reviews.reduce((s, r) => s + r.ratingNumber, 0) /
              count
              : 0
          return { reviewCount: count, averageRating: avg }
        })()

      // Seller avatar for cards; strip other user fields for public callers
      const seller = resolveListingSeller(obj, sellersByUuid)
      if (seller) {
        obj.sellerAvatar = seller.profileImage || ''
        obj.sellerName = seller.name || ''
        obj.sellerRef = getSellerRef(seller)
        if (isPublicUser) {
          obj.userId = {
            profileImage: seller.profileImage || '',
            name: seller.name || '',
          }
        }
      }

      if (!useCardProjection) {
        if (isPublicUser) {
          await attachDocumentSignedUrls(obj, {
            fields: ['evaluationCertificate', 'technicalReport'],
          })
        } else {
          await attachDocumentSignedUrls(obj)
        }
      }
      sanitizeListingMediaResponse(obj)

      return {
        ...obj,
        reviewCount,
        averageRating,
      }
    }),
  )

  res.json({
    products: modifiedProducts,
    currentPage: page,
    totalPages: Math.ceil(totalFilteredProducts / limit),
    limit,
    totalProducts: totalFilteredProducts,
  })
})

// get all product
const getAllProductByFilter = asyncHandler(async (req, res) => {
  const header = req.headers['authorization']
  const token = header && header.split(' ')[1]
  let userId = null

  const modifiedQuery = processQuery(req.query)

  if (token) {
    userId = verifyToken(token)
  }
  modifiedQuery.listing = MARKETPLACE_LISTING_FILTER

  // Facility filtering (assuming "materials" is a field in the Property model)
  if (req.query.materials) {
    const desiredMaterials = req.query.materials.split(',')

    // Choose filtering approach based on requirement:
    if (req.query.allMaterials) {
      // Find properties with ALL specified materials
      modifiedQuery.materials = { $all: desiredMaterials }
    } else {
      // Find properties with AT LEAST ONE specified facility (default)
      modifiedQuery.materials = { $in: desiredMaterials }
    }
  }
  modifiedQuery.status = 1
  modifiedQuery.isDeleted = false
  let query = Jewelry.find(modifiedQuery)
    .populate('pictures')
    .populate('video')
    .populate('thumbnailImg').populate('qrScan')
    .populate('evaluationCertificate')
    .populate('uploadDocument')
    .populate('invoice')
    .populate('dealhunterId')
    .populate('transactionId')
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
  const productCount = await Jewelry.countDocuments()
  if (skip >= productCount) {
    return res
      .status(400)
      .json({ message: 'Assets on this page does not exist' })
  }

  try {
    const totalFilteredProducts = await Jewelry.countDocuments(modifiedQuery)

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
      totalPages: Math.ceil(totalFilteredProducts / limit),
      limit: req?.query?.limit ? parseFloat(req?.query?.limit) : 10,
      totalProducts: totalFilteredProducts,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ error: true, message: err?.message || 'Internal error!' })
  }
})

// get related product

const getRelatedProduct = asyncHandler(async (req, res) => {
  try {
    const result = await findRelatedListings({
      Model: Jewelry,
      cardFields: CARD_JEWELRY_FIELDS,
      query: req.query,
      softFields: ['assetType', 'country', 'city', 'make', 'brands'],
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
      const product = await Jewelry.findOne(
        buildListingIdQuery(moduleId),
      ).populate('uploadDocument')
      if (!product) {
        return res.status(404).json({ message: 'jwellery not found' })
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
      sanitizeListingMediaObjectIds(req.body)
      if (req.body.listing !== undefined || req.body.price !== undefined) {
        req.body.listing = applyListingVisibility('jewelry', req.body, product)
      }
      updatedProduct = await Jewelry.findByIdAndUpdate(
        product._id,
        toListingUpdateOps(req.body),
        { new: true }
      ).select('-_id')

      try {
        if (requestedDocumentsUpdated) {
          await notifyAssetHolderDocumentRequested({
            listing: updatedProduct,
            assetType: 'jewelry',
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
            assetType: 'jewelry',
            evaluator: req.user,
          })
        } else {
          const NotificationData = {
            userUUID: updatedProduct?.userUUID,
            UserRole: 'AssetHolder',
            title: 'Assets Jewelry',
            message: `Your asset jewelry (${updatedProduct?.title}) has beed updated.`,
            RelateRoute: 'jewellery',
            RelatedId: updatedProduct?._id,
          }
          if (documentFulfilled) {
            NotificationData.UserRole = 'Evaluator'
            NotificationData.userUUID = updatedProduct?.evaluatorUUID
            NotificationData.message = `Seller uploaded a requested document for jewelry (${updatedProduct?.title}).`
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
        message: 'An error occurred while updating the jwellery',
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

    const jewelry = await Jewelry.findOne({ uuid: id, isDeleted: false })

    if (!jewelry || jewelry.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Jewelry not found or already deleted' })
    }

    // Soft delete
    jewelry.isDeleted = true
    jewelry.deletedAt = new Date()
    await jewelry.save()

    // Send notification
    try {
      const NotificationData = {
        userId: jewelry.userId,
        userUUID: jewelry.userUUID,
        UserRole: 'AssetHolder',
        title: 'Assets Jewelry',
        message: `Your asset jewelry (${jewelry.title}) has been deleted.`,
        RelateRoute: 'jewellery',
        RelatedId: jewelry._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.json({ message: 'Jewelry soft-deleted successfully', jewelry })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

const addRating = asyncHandler(async (req, res, next) => {
  // const { id } = req.user;
  const { star, prodId, comment, id } = req.body
  try {
    const product = await Jewelry.findOne({ uuid: prodId, isDeleted: false })
    let allreadyRated = product.ratings.find(
      (rating) => rating.postedBy.toString() === id.toString()
    )
    if (allreadyRated) {
      const updateRating = await Jewelry.updateOne(
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
      const rateProduct = await Jewelry.findByIdAndUpdate(
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
    const getallrating = await Jewelry.findById(product._id, {
      isDeleted: false,
    })
    let totalRating = getallrating.ratings.length
    let ratingSum = getallrating.ratings
      .map((item) => item.star)
      .reduce((prev, current) => prev + current, 0)
    let actualRating = Math.round(ratingSum / totalRating)
    const finalProduct = await Jewelry.findByIdAndUpdate(
      prodId,
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
    const priceAggregation = await Jewelry.aggregate([
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
    console.log(error)
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
  getPrice,
  getAllProductByFilter,
  getApprovedListingsMetrics,
}
