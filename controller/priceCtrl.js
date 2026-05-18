import Price from '../models/priceModel.js'

export const createPrice = async (req, res) => {
  try {
    const { assetType, value, price, subCategory, category, userUUID } =
      req.body

    // Validate that required fields are provided
    if (!assetType || !price || !category || !userUUID) {
      return res
        .status(400)
        .json({ message: 'All required fields must be provided' })
    }

    // Create the new report with assetType, productTitle, and productId initially set to null
    const newReport = new Price({
      assetType,
      value,
      price,
      category,
      subCategory,
      userUUID,
    })

    await newReport.save()

    res
      .status(201)
      .json({ message: 'Price added successfully', price: newReport })
  } catch (error) {
    res.status(500).json({ message: 'Error submitting request', error })
  }
}

export const getPrices = async (req, res) => {
  const { id } = req.params
  console.log(id, 'sdfghyjkl')

  try {
    const reports = await Price.find({ userUUID: id, isDeleted: false }).select(
      '-_id -isDeleted -deletedAt'
    )
    res.status(200).json(reports)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const filterPrice = async (req, res) => {
  const { userUUID, category, subCategory, value } = req.query

  try {
    // Construct the filter query dynamically
    const query = {}

    if (userUUID) query.userUUID = userUUID
    if (category) query.category = category
    if (subCategory) query.subCategory = subCategory
    if (value) query.value = value
    query.isDeleted = false
    // Fetch data based on the query object
    const reports = await Price.find(query).select('-_id -isDeleted -deletedAt')

    // Send the filtered reports
    res.status(200).json(reports)
  } catch (error) {
    // Handle errors and send response
    res.status(500).json({ message: 'Error fetching requests', error })
  }
}

export const getPriceById = async (req, res) => {
  try {
    const reportId = req.params.id

    const report = await Price.findOne({
      uuid: reportId,
      isDeleted: false,
    }).select('-_id -isDeleted -deletedAt')

    if (!report) {
      return res.status(404).json({ message: 'Price not found' })
    }

    res.status(200).json(report)
  } catch (error) {
    console.error('Error fetching report by ID:', error)
    res.status(500).json({ message: 'Error fetching report', error })
  }
}

export const updatePrice = async (req, res) => {
  try {
    const { id } = req.params

    const updatedReport = await Price.findOneAndUpdate({ uuid: id }, req.body, {
      new: true,
    }).select('-_id -isDeleted -deletedAt')
    if (!updatedReport) {
      return res.status(404).json({ message: 'Price not found' })
    }
    res
      .status(200)
      .json({ message: 'Report updated successfully', request: updatedReport })
  } catch (error) {
    res.status(500).json({ message: 'Error updating Report', error })
  }
}

export const deletePrice = async (req, res) => {
  const { id } = req.params
  const user = req.user
  console.log('delete', id, user)

  try {
    const price = await Price.findOne({
      uuid: id,
      userUUID: user.uuid,
      isDeleted: false,
    })
    console.log(price)

    if (!price || price.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Price not found or already deleted' })
    }

    // Soft delete
    price.isDeleted = true
    price.deletedAt = new Date()
    await price.save()

    res.json({ message: 'Price deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Something went wrong' })
  }
}
