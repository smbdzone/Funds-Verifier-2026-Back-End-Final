import Transaction from '../models/transactionModel.js'

export const createRequest = async (req, res) => {
  try {
    const { payment_method_status, payment_details } = req.body

    // Validate that required fields are provided
    if (!payment_method_status && !payment_details) {
      return res
        .status(400)
        .json({ message: 'All required fields must be provided' })
    }

    // Create the new 3D request with assetType, productTitle, and productId initially set to null
    const newRequest = new Transaction({
      payment_method_status,
      payment_details,
    })

    await newRequest.save()

    res.status(201).json({
      message: 'Request submitted successfully',
      transaction: newRequest,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error submitting request', error })
  }
}

export const getRequests = async (req, res) => {
  try {
    const requests = await Transaction.find({ isDeleted: false }).select('-_id')
    res.status(200).json(requests)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const getRequestById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      uuid: req.params.id,
      isDeleted: false,
    }).lean()
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    res.status(200).json(transaction)
  } catch (error) {
    console.error('Error fetching request: ', error) // Log the error for better debugging
    res.status(500).json({ message: 'Error fetching request', error })
  }
}

export const updateRequest = async (req, res) => {
  try {
    const { id } = req.params
    const updatedRequest = await Transaction.findOneAndUpdate(
      { uuid: id, isDeleted: false },
      req.body,
      {
        new: true,
      }
    )
    if (!updatedRequest) {
      return res.status(404).json({ message: 'Transaction not found' })
    }
    res.status(200).json({
      message: 'Transaction updated successfully',
      transaction: updatedRequest,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating Transaction', error })
  }
}
