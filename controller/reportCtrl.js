import Report from '../models/reportModel.js'
import Property from '../models/propertyModel.js'
import { getDocumentSignedUrl } from '../helper/attachDocumentSignedUrls.js'
import Car from '../models/carModel.js'
import Jewelry from '../models/jewelryModel.js'
import Boat from '../models/boatModel.js'
import { createNotification } from './notifications.controller.js'
import { sanitizeEmail, sanitizeUUID } from '../utils/nosqlSanitizer.js'
import { assertListingApprovedForPremium } from '../utils/listingApprovalHelper.js'
import {
  linkTechnicalReportToListing,
  listingMetaFromApproval,
  clearUnpaidPremiumOnListing,
  modelForAssetType,
  isPremiumServiceRecordPaid,
} from '../utils/listingPremiumSync.js'
import {
  notifyAssetHolderTechnicalReportCompleted,
  resolveListingFromPremiumRecord,
} from '../helper/notifyAssetHolderListingEvents.js'
import { notifyFvPremiumServiceRequested } from '../utils/fvPortalMail.js'
import { notifyPremiumProviderRequest } from '../utils/premiumProviderMail.js'

export const createReport = async (req, res) => {
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
          'technicalReport',
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

    // Create the new report with assetType, productTitle, and productId initially set to null
    const newReport = new Report({
      name,
      email: sanitizedEmail,
      dateTime,
      phone,
      productTitle: listingMeta.productTitle ?? null,
      productId: listingMeta.productId ?? null,
      productUUID: listingMeta.productUUID ?? null,
      status: 'pending',
      payment_details,
      payment_method_status,
      assetType,
      value,
      price,
      category,
      subCategory,
    })

    await newReport.save()
    await linkTechnicalReportToListing(newReport)

    try {
      const NotificationData = {
        userId: newReport?.userId,
        userUUID: newReport?.userUUID,
        UserRole: 'TechnicalReport',
        title: 'Technical Report',
        message: `A new request for technical report added.`,
        RelateRoute: 'TechnicalReport',
        RelatedId: newReport?.productId,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    try {
      await notifyFvPremiumServiceRequested({
        serviceType: 'technical_report',
        request: newReport,
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
      console.log({ fvPortalTechnicalRequestEmailError: error?.message || error })
    }

    try {
      await notifyPremiumProviderRequest({
        serviceType: 'technical_report',
        request: newReport,
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
      console.log({
        premiumTechnicalRequestEmailError: error?.message || error,
      })
    }

    res
      .status(201)
      .json({ message: 'Request submitted successfully', report: newReport })
  } catch (error) {
    res.status(500).json({ message: 'Error submitting request', error })
  }
}

export const getReports = async (req, res) => {
  try {
    const reports = await Report.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('reportFile')
      .lean()

    const paidReports = reports.filter(isPremiumServiceRecordPaid)

    const payload = paidReports.map(
      ({ _id, productId, userId, createdAt, updatedAt, isDeleted, deletedAt, ...rest }) =>
        rest,
    )

    res.status(200).json(payload)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const getReportById = async (req, res) => {
  try {
    const reportId = req.params.report

    // ✅ SECURITY: Sanitize UUID to prevent NoSQL injection
    const sanitizedUUID = sanitizeUUID(reportId)
    if (!sanitizedUUID) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    const report = await Report.findOne({ uuid: sanitizedUUID, isDeleted: false })
      .select('-_id -isDeleted -deletedAt -createdAt -updatedAt')
      .populate('reportFile')
      .lean()

    if (!report) {
      return res.status(404).json({ message: 'Report not found' })
    }

    let productModel
    let projection = { title: 1, phoneNumber: 1, price: 1, uuid: 1, _id: 0 } // always include these

    switch (report.assetType) {
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
      .findById(report.productId, projection, { isDeleted: false })
      .lean()

    if (!product) {
      return res.status(404).json({ message: 'Product not found' })
    }

    const response = { ...report, product }
    if (response.reportFile) {
      const signed = await getDocumentSignedUrl(response.reportFile)
      if (signed) {
        response.reportFile.signedUrl = signed
        if (response.reportFile.Certificate) {
          response.reportFile.Certificate.signedUrl = signed
        }
      }
    }
    return res.status(200).json(response)
  } catch (error) {
    console.error('Error fetching report by ID:', error)
    return res.status(500).json({ message: 'Error fetching report', error })
  }
}

export const updateReport = async (req, res) => {
  try {
    const data = { ...req.body }
    const { report } = req.params

    const sanitizedUUID = sanitizeUUID(report)
    if (!sanitizedUUID) {
      return res.status(400).json({
        success: false,
        message: 'Invalid UUID format',
      })
    }

    if (data.reportFile) {
      data.status = 'successful'
    }

    if (data.assetId) {
      const listingUuid = sanitizeUUID(data.assetId)
      if (listingUuid) data.productUUID = listingUuid
      delete data.assetId
    }

    const existingReport = await Report.findOne({
      uuid: sanitizedUUID,
      isDeleted: false,
    })
    if (!existingReport) {
      return res.status(404).json({ message: 'Report not found' })
    }

    const updatedReport = await Report.findOneAndUpdate(
      { uuid: sanitizedUUID },
      data,
      {
        new: true,
      }
    ).select('-_id -isDeleted -deletedAt -createdAt -updatedAt')

    if (!updatedReport) {
      return res.status(404).json({ message: 'Report not found' })
    }

    const reportForLink = await Report.findOne({
      uuid: sanitizedUUID,
      isDeleted: false,
    })
    if (reportForLink) {
      await linkTechnicalReportToListing(reportForLink)
    }

    const becameSuccessful =
      existingReport.status !== 'successful' &&
      updatedReport.status === 'successful'

    try {
      if (becameSuccessful) {
        const listing =
          (await resolveListingFromPremiumRecord(
            reportForLink || updatedReport,
          )) || null
        await notifyAssetHolderTechnicalReportCompleted({
          listing: listing || {
            userUUID: updatedReport?.userUUID || existingReport.userUUID,
            title:
              updatedReport?.productTitle || existingReport.productTitle,
            uuid: updatedReport?.productUUID || existingReport.productUUID,
            _id: updatedReport?.productId || existingReport.productId,
            assetType: updatedReport?.assetType || existingReport.assetType,
          },
          assetType: updatedReport?.assetType || existingReport.assetType,
          provider: req.user || { name: updatedReport?.name },
        })
      } else {
        const NotificationData = {
          userId: updatedReport?.userId,
          userUUID: updatedReport?.userUUID,
          UserRole: 'AssetHolder',
          title: 'Technical Report',
          message: `report for technical report is updated.`,
          RelateRoute: 'TechnicalReport',
          RelatedId: updatedReport?.productId,
          RelatedUUID: updatedReport?.productUUID,
        }
        await createNotification({ data: NotificationData })
      }
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res
      .status(200)
      .json({ message: 'Report updated successfully', request: updatedReport })
  } catch (error) {
    return res.status(500).json({ message: 'Error updating Report', error })
  }
}
