import Request3D from '../models/request3DModel.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import { createNotification } from './notifications.controller.js'
import { sanitizeEmail, sanitizeUUID } from '../utils/nosqlSanitizer.js'
import { assertListingApprovedForPremium } from '../utils/listingApprovalHelper.js'
import {
  linkWalkthroughToListing,
  listingMetaFromApproval,
  clearUnpaidPremiumOnListing,
  modelForAssetType,
  isPremiumServiceRecordPaid,
  fillListingTitleOnPremiumRecord,
} from '../utils/listingPremiumSync.js'
import {
  notifyAssetHolderWalkthroughCompleted,
  resolveListingFromPremiumRecord,
} from '../helper/notifyAssetHolderListingEvents.js'
import { notifyFvPremiumServiceRequested } from '../utils/fvPortalMail.js'
import { notifyPremiumProviderRequest } from '../utils/premiumProviderMail.js'

export const createRequest = async (req, res) => {
  try {
    const userId = req.query.userId

    const {
      name,
      email,
      dateTime,
      phone,
      payment_details,
      payment_method_status,
      assetType,
      value,
      price,
      category,
      subCategory,
      productUUID,
      productId,
    } = req.body

    let listingMeta = {}
    if (productUUID || productId) {
      const approval = await assertListingApprovedForPremium({
        productUUID,
        productId,
        assetType,
      })
      if (!approval.ok) {
        return res.status(approval.status).json({ message: approval.message })
      }
      listingMeta = listingMetaFromApproval(approval)
      const AssetModel = modelForAssetType(assetType)
      if (AssetModel && approval.listing) {
        await clearUnpaidPremiumOnListing(approval.listing, AssetModel, [
          'video3DWalkthrough',
        ])
      }
    }

    // Validate that required fields are provided
    if (!name || !email || !dateTime || !phone) {
      return res
        .status(400)
        .json({ message: 'All required fields must be provided' })
    }

    const sanitizedEmail = sanitizeEmail(email)
    if (!sanitizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }

    // Create the new 3D request with assetType, productTitle, and productId initially set to null
    const newRequest = new Request3D({
      name,
      email: sanitizedEmail,
      dateTime,
      phone,
      assetType,
      productTitle: listingMeta.productTitle ?? null,
      productId: listingMeta.productId ?? null,
      productUUID: listingMeta.productUUID ?? null,
      status: 'pending',
      payment_details,
      payment_method_status,
      value,
      price,
      category,
      subCategory,
    })

    await newRequest.save()
    await linkWalkthroughToListing(newRequest)

    try {
      const NotificationData = {
        userId: newRequest?.userId,
        userUUID: newRequest?.userUUID,
        UserRole: '3dWalkthrough',
        title: 'Request 3D',
        message: `A new request for 3d walkthrough.`,
        RelateRoute: '3dWalkthrough',
        RelatedId: newRequest?._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    try {
      await notifyFvPremiumServiceRequested({
        serviceType: '3d_walkthrough',
        request: newRequest,
        listing: listingMeta?.productTitle
          ? {
            title: listingMeta.productTitle,
            assetType,
            uuid: listingMeta.productUUID,
            _id: listingMeta.productId,
          }
          : null,
      })
    } catch (error) {
      console.log({ fvPortal3dRequestEmailError: error?.message || error })
    }

    try {
      await notifyPremiumProviderRequest({
        serviceType: '3d_walkthrough',
        request: newRequest,
        listing: listingMeta?.productTitle
          ? {
            title: listingMeta.productTitle,
            assetType,
            uuid: listingMeta.productUUID,
            _id: listingMeta.productId,
          }
          : null,
      })
    } catch (error) {
      console.log({ premium3dRequestEmailError: error?.message || error })
    }

    res
      .status(201)
      .json({ message: 'Request submitted successfully', request: newRequest })
  } catch (error) {
    res.status(500).json({ message: 'Error submitting request', error })
  }
}

export const getRequests = async (req, res) => {
  try {
    const requests = await Request3D.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .lean()

    const paidRequests = []
    for (const request of requests) {
      if (!isPremiumServiceRecordPaid(request)) continue
      await fillListingTitleOnPremiumRecord(request)
      paidRequests.push(request)
    }

    const payload = paidRequests.map(
      ({ _id, productId, userId, createdAt, updatedAt, ...rest }) => rest,
    )

    res.status(200).json(payload)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const getRequestById = async (req, res) => {
  // console.log(req.params.request)
  try {
    const request = await Request3D.findOne({
      uuid: req.params.request,
      isDeleted: false,
    })
      .lean()
      .select('-_id -createdAt -updatedAt')
    if (!request) {
      return res.status(404).json({ message: 'Request not found' })
    }

    // Determine the correct model based on assetType
    let productModel
    let projection = { title: 1, phoneNumber: 1, price: 1, uuid: 1, _id: 0 } // always include these

    switch (request.assetType) {
      case 'Property For Sale':
      case 'Property For Lease':
      case 'Property Off Plan For Sale':
        productModel = Property
        Object.assign(projection, {
          sizeSQFT: 1,
          bedrooms: 1,
          bathrooms: 1,
          developer: 1,
          isFurnished: 1,
          occupancyStatus: 1,
        })
        break
      case 'Car For Sale':
        productModel = Car
        Object.assign(projection, {
          make: 1,
          model: 1,
          year: 1,
          kilometers: 1,
          seats: 1,
          doors: 1,
          bodyCondition: 1,
          warranty: 1,
          fuelType: 1,
          noofCylinders: 1,
        })
        break
      case 'Boats For Sale':
        productModel = Boat
        Object.assign(projection, {
          length: 1,
          condition: 1,
          age: 1,
          usage: 1,
          seats: 1,
        })
        break
      case 'Jewellery For Sale':
        productModel = Jewelry
        Object.assign(projection, {
          jewelryMetal: 1,
          grams: 1,
          condition: 1,
          age: 1,
        })
        break
      default:
        return res.status(400).json({ message: 'Unknown asset type' })
    }

    // Fetch only the required fields dynamically
    const product = await productModel
      .findById(request.productId, projection, { isDeleted: false })
      .lean()
    if (!product) {
      return res.status(404).json({ message: 'Product not found' })
    }
    // Combine request data with the associated product
    const response = { ...request, product }

    res.status(200).json(response)
  } catch (error) {
    console.error('Error fetching request: ', error) // Log the error for better debugging
    res.status(500).json({ message: 'Error fetching request', error })
  }
}

export const updateRequest = async (req, res) => {
  try {
    const { request } = req.params
    const data = { ...req.body }

    const existingRequest = await Request3D.findOne({
      uuid: request,
      isDeleted: false,
    })
    if (!existingRequest) {
      return res.status(404).json({ message: 'Request not found' })
    }

    const link =
      typeof data.link === 'string' ? data.link.trim() : ''
    if (
      link &&
      (link.startsWith('http://') || link.startsWith('https://'))
    ) {
      data.status = 'successful'
    }

    const updatedRequest = await Request3D.findOneAndUpdate(
      { uuid: request },
      data,
      {
        new: true,
      }
    )
    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found' })
    }

    await linkWalkthroughToListing(updatedRequest)

    const becameSuccessful =
      existingRequest.status !== 'successful' &&
      updatedRequest.status === 'successful'

    try {
      if (becameSuccessful) {
        const listing =
          (await resolveListingFromPremiumRecord(updatedRequest)) || null
        await notifyAssetHolderWalkthroughCompleted({
          listing: listing || {
            userUUID: updatedRequest?.userUUID || existingRequest.userUUID,
            title:
              updatedRequest?.productTitle || existingRequest.productTitle,
            uuid: updatedRequest?.productUUID || existingRequest.productUUID,
            _id: updatedRequest?.productId || existingRequest.productId,
            assetType: updatedRequest?.assetType || existingRequest.assetType,
          },
          assetType: updatedRequest?.assetType || existingRequest.assetType,
          provider: req.user || { name: updatedRequest?.name },
        })
      } else {
        const NotificationData = {
          userId: updatedRequest?.userId,
          userUUID: updatedRequest?.userUUID,
          UserRole: 'AssetHolder',
          title: '3D Walkthrough',
          message: `your request for 3d walkthrough is updated.`,
          RelateRoute: '3dWalkthrough',
          RelatedId: updatedRequest?.productId,
        }
        await createNotification({ data: NotificationData })
      }
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json({
      message: 'Request updated successfully',
      request: updatedRequest,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating request', error })
  }
}
