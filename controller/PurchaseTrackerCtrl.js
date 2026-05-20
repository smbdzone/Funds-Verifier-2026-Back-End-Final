import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import Car from '../models/carModel.js'
import Property from '../models/propertyModel.js'

export const PurchaseTrackerForAssetHolder = async (req, res) => {
  try {
    const userId = req.query.userId || req.query.userUUID

    if (!userId)
      return res
        .status(400)
        .json({ message: 'userId is required in query parameters.' })

    const requester = req.user
    if (
      requester?.role !== 'Admin' &&
      String(userId) !== String(requester._id) &&
      String(userId) !== String(requester.uuid)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden — you can only access your own purchase tracker',
      })
    }

    const getProductsWithType = async (
      Model,
      itemType,
      populateOptions = []
    ) => {
      let query = Model.find({ dealhunterId: userId, isDeleted: false })

      // Apply populate options if provided
      populateOptions?.forEach((pop) => {
        query = query.populate(pop)
      })

      const products = await query
      return products.map((product) => ({ ...product.toObject(), itemType }))
    }

    const commonPopulateOptions = [
      { path: 'pictures', select: 'images' },
      { path: 'video', select: 'videos' },
      { path: 'thumbnailImg', select: 'images' },
      { path: 'evaluationCertificate', select: 'Certificate' },
      { path: 'invoice', select: 'Certificate' },
      { path: 'transactionDepositDocument', select: 'Certificate' },
      { path: 'transactionId' },
      { path: 'video3DWalkthrough' },
      { path: 'technicalReport' },
      { path: 'userId', select: 'name email' },
      // { path: "dealhunterId", select: "name email" },
    ]

    const propertyPopulateOptions = [
      ...commonPopulateOptions,
      { path: 'assetId' },
    ]
    const carPopulateOptions = [...commonPopulateOptions]
    const jewelryPopulateOptions = [...commonPopulateOptions]
    const boatPopulateOptions = [...commonPopulateOptions]

    // Fetch all types in parallel
    const [boats, jewelry, cars, properties] = await Promise.all([
      getProductsWithType(Boat, 'boat', boatPopulateOptions),
      getProductsWithType(Jewelry, 'jewelry', jewelryPopulateOptions),
      getProductsWithType(Car, 'car', carPopulateOptions),
      getProductsWithType(Property, 'property', propertyPopulateOptions),
    ])

    const allProducts = [...boats, ...jewelry, ...cars, ...properties]

    return res
      .status(200)
      .json({ message: 'Sales tracking of products', payload: allProducts })
  } catch (error) {
    console.error('Error fetching sales tracker:', error)
    return res
      .status(500)
      .json({ message: error?.message || 'Internal Server Error!' })
  }
}
