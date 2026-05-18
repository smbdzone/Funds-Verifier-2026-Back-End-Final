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
import { attachDocumentSignedUrls } from '../helper/attachDocumentSignedUrls.js'
import { stripNullPremiumRefs } from '../utils/listingPremiumSync.js'
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
import { AddPaymentJob } from '../utils/jobs/index.js'
import UserPaymentDetails from '../models/UserPaymentDetails.js'
import { PUBLIC_CAR_FIELDS } from '../constants/publicFields.js'

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

    const createPdt = await Car.create([req.body], { session })

    // add evaluation payment message queue
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
      // Keep error logging for queue failures
      console.log(`Error adding job to queue: ${error.message}`)
    }

    // Try to find and update the latest pending 3D Request
    const pendingRequest = await Request3D.findOneAndUpdate(
      { status: 'pending' },
      {
        productId: createPdt[0]._id,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
        status: 'successful',
      },
      { new: true, sort: { createdAt: -1 }, session }
    )
    const pendingReport = await Report.findOneAndUpdate(
      { status: 'pending' },
      {
        productId: createPdt[0]._id,
        productTitle: createPdt[0].title,
        assetType: createPdt[0].assetType,
        status: 'successful',
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

      try {
        const NotificationData = {
          userId: user._id,
          userUUID: user.uuid,
          UserRole: 'Evaluator',
          title: 'Evaluation',
          message: `New Car (${createPdt[0]?.title}) added for evaluation.`,
          RelateRoute: 'evaluation',
          RelatedId: createPdt[0]?._id,
        }
        await createNotification({ data: NotificationData })
      } catch (error) {
        console.log({ error: error?.message })
      }

      res.json({
        car: createPdt[0],
        message:
          'Car created successfully, but no pending 3D request or but no pending 3D report was found to update.',
      })
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

// get single product
const getSingleProduct = asyncHandler(async (req, res) => {
  const { id } = req.params

  const { sanitizeUUID } = await import('../utils/nosqlSanitizer.js')
  const sanitizedId = sanitizeUUID(id)
  if (!sanitizedId) {
    return res.status(400).json({
      success: false,
      message: 'Invalid UUID format',
    })
  }

  try {
    const car = await Car.findOne({ uuid: sanitizedId, isDeleted: false })
      .populate('pictures')
      .populate('video')
      .populate('thumbnailImg')
      .populate('video3DWalkthrough')
      .populate('uploadDocument')
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

    await refreshListingMediaSignedUrls(car)
    // Strip server-internal S3 fields before responding (signedUrl is all the
    // client needs — see helper/sanitizeListingResponse.js for the rationale).
    sanitizeListingMediaResponse(car)

    const isPrivilegedUser =
      req.user &&
      ['Admin', 'AssetHolder', 'Evaluator', 'Sub-Evaluator'].includes(
        req.user.role,
      )

    if (!isPrivilegedUser) {
      return res.json(pickFields(car, PUBLIC_CAR_FIELDS.trim().split(/\s+/)))
    }

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
  const queryObj = { ...req.query }

  // ---------------- AUTH (SAFE) ----------------
  let user = null
  const header = req.headers['authorization']
  const token = header?.split(' ')[1]

  if (token) {
    const userId = verifyToken(token)
    if (userId) {
      user = await UserModel.findById(userId)
    }
  }

  const isAuthenticated = !!user

  // ---------------- QUERY CLEANUP ----------------
  const excludeField = [
    'page',
    'sort',
    'limit',
    'fields',
    'date',
    'minPrice',
    'maxPrice',
    'statusFilter',
    'title',
    'dashboard',
  ]

  excludeField.forEach((el) => delete queryObj[el])

  let queryStr = JSON.stringify(queryObj)
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (m) => `$${m}`)
  const parseData = JSON.parse(queryStr)

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
    parseData.title = { $regex: req.query.title, $options: 'i' }
  }

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
      ['Admin', 'Evaluator'].includes(user.role) || roleNorm === 'superadmin'

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

  // 🔐 FIELD SELECTION
  if (!isAuthenticated) {
    query = query.select(PUBLIC_CAR_FIELDS)
  } else {
    query = query.select('-__v')
  }

  // 🔐 SAFE POPULATES
  query = query
    .populate({ path: 'pictures', select: '-_id' })
    .populate({ path: 'video', select: '-_id' })
    .populate({ path: 'thumbnailImg', select: '-_id' })

  // ❗ Only authenticated users get sensitive data
  if (isAuthenticated) {
    query = query
      .populate({ path: 'evaluationCertificate', select: '-_id' })
      .populate({ path: 'uploadDocument', select: '-_id' })
      .populate({ path: 'invoice', select: '-_id' })
      .populate({
        path: 'technicalReport',
        populate: { path: 'reportFile', select: '-_id' },
      })
      .populate({ path: 'ratings.postedBy', select: '-_id' })
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

  // ---------------- RESPONSE SANITIZATION ----------------
  const finalProducts = await Promise.all(
    products.map(async (product) => {
      const obj = product.toObject()

      // ratings → stars only for public
      if (!isAuthenticated && Array.isArray(obj.ratings)) {
        obj.ratings = obj.ratings.map((r) => ({ star: r.star }))
      }

      if (isAuthenticated) {
        await attachDocumentSignedUrls(obj)
      }

      // Drop server-internal S3 metadata (s3Bucket/s3Key/s3VersionId/s3ETag/url)
      // — signedUrl is the only URL the client needs.
      sanitizeListingMediaResponse(obj)

      return obj
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
    .populate('thumbnailImg')
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
  const { assetType, country, city, model, price } = req.query

  // Construct the query object based on provided properties
  const queryObj = {}
  if (assetType) queryObj.assetType = assetType
  if (country) queryObj.country = country
  if (city) queryObj.city = city
  if (model) queryObj.model = model
  if (price) queryObj.price = price
  queryObj.isDeleted = false
  try {
    // Execute the query with the constructed query object
    const allProduct = await Car.find(queryObj).select('-_id')
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
      // Find the existing product
      const product = await Car.findOne({ uuid: moduleId, isDeleted: false })
      if (!product) {
        return res.status(404).json({ message: 'car not found' })
      }

      // Update slug if title is provided
      if (req.body.title) {
        req.body.slug = slugify(req.body.title)
      }

      // Handle technicalReport upload
      if (req.files && req.files.technicalReport) {
        req.body.technicalReport = req.files.technicalReport[0].path
      }

      // Handle evaluationCertificate upload
      if (req.files && req.files.evaluationC) {
        req.body.evaluationC = req.files.evaluationC[0].path
      }

      // Handle uploadDocument upload and append to existing array
      if (req.files && req.files.uploadDocument) {
        const uploadedDocs = req.files.uploadDocument.map((file) => file.path)
        req.body.uploadDocument = [
          ...(product.uploadDocument || []),
          ...uploadedDocs,
        ]
      }

      let updatedProduct
      stripNullPremiumRefs(req.body)
      updatedProduct = await Car.findByIdAndUpdate(
        product._id,
        { $set: req.body },
        { new: true }
      ).select('-_id')

      try {
        const NotificationData = {
          userUUID: updatedProduct?.userUUID,
          UserRole: 'AssetHolder',
          title: 'Assets Car',
          message: `Your car (${updatedProduct?.title}) has been updated.`,
          RelateRoute: 'cars',
          RelatedId: updatedProduct?._id,
        }
        await createNotification({ data: NotificationData })
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
