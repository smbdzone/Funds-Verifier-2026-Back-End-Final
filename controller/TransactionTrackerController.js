import TransactionTracker from '../models/TransactionTrackerModel.js'

// Create a new transaction tracker
const createTransactionTracker = async ({ data }) => {
  try {
    if (!data?.userId)
      throw { status: 400, message: 'user Id is required', error: true }
    if (!data?.customerName)
      throw { status: 400, message: 'customer name is required', error: true }
    if (!data?.assetType)
      throw { status: 400, message: 'asset type is required', error: true }
    if (!data?.customerReferenceNumber)
      throw {
        status: 400,
        message: 'customer reference number is required',
        error: true,
      }

    const tracker = new TransactionTracker(data)
    await tracker.save()

    return { success: true, tracker }
  } catch (error) {
    throw { status: 500, message: error?.message || 'Internal server error!' }
  }
}

// Get all transaction tracker by user iD
const getAllTrackersByUserId = async ({ userId }) => {
  try {
    const trackers = await TransactionTracker.find({ userId, isDeleted: false })
    return { success: true, trackers }
  } catch (error) {
    throw { status: 500, message: error?.message || 'Internal server error!' }
  }
}

// Get a transaction tracker by ID
const getTrackerById = async ({ id }) => {
  try {
    const tracker = await TransactionTracker.findById(id, { isDeleted: false })
    if (!tracker) {
      throw {
        status: 400,
        error: true,
        message: 'Transaction tracker not found!',
      }
    }
    return { success: true, tracker }
  } catch (error) {
    throw { status: 500, message: error?.message || 'Internal server error!' }
  }
}

// Update a transaction tracker by ID
const updateTransactionTracker = async ({ id, data }) => {
  try {
    const tracker = await TransactionTracker.findById(id, { isDeleted: false })
    if (!tracker)
      throw {
        status: 404,
        message: 'Transaction tracker not found',
        error: true,
      }

    // Check if documents update is included
    if (data?.documents && Array.isArray(data?.documents)) {
      data?.documents?.forEach((newDoc) => {
        const docIndex = tracker.documents.findIndex(
          (doc) => doc._id === newDoc._id
        )
        if (docIndex !== -1) {
          tracker.documents[docIndex].url =
            newDoc.url || tracker.documents[docIndex].url
          tracker.documents[docIndex].status =
            newDoc.status || tracker.documents[docIndex].status
        } else {
          // Add as new custom document
          tracker.documents.push({
            name: newDoc.name,
            url: newDoc.url,
            status: newDoc.status || 'pending',
          })
        }
      })
    }

    // Update other fields
    tracker.assetReferenceNumber =
      data.assetReferenceNumber ?? tracker.assetReferenceNumber
    tracker.customerName = data.customerName ?? tracker.customerName
    tracker.assetType = data.assetType ?? tracker.assetType
    tracker.assetDescription = data.assetDescription ?? tracker.assetDescription
    tracker.customerReferenceNumber =
      data.customerReferenceNumber ?? tracker.customerReferenceNumber
    tracker.stages = data.stages ?? tracker.stages
    tracker.currentStage = data.currentStage ?? tracker.currentStage

    await tracker.save()
    return { success: true, tracker }
  } catch (error) {
    throw { status: 500, message: error?.message || 'Internal server error!' }
  }
}

// Delete a transaction tracker by ID
const deleteTrackerById = async ({ id }) => {
  try {
    const tracker = await TransactionTracker.findByIdAndDelete(id, {
      isDeleted: false,
    })
    if (!tracker) {
      throw {
        status: 400,
        error: true,
        message: 'Transaction tracker not found!',
      }
    }
    return { success: true, message: 'Transaction tracker with id is deleted.' }
  } catch (error) {
    throw { status: 500, message: error?.message || 'Internal server error!' }
  }
}

export {
  createTransactionTracker,
  getAllTrackersByUserId,
  getTrackerById,
  updateTransactionTracker,
  deleteTrackerById,
}
