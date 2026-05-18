// controllers/platformFeeController.js
import PlatformFee from '../models/platFormFee.js'
import { createNotification } from './notifications.controller.js'

// Fetch platform fees
const getPlatformFees = async (req, res) => {
  try {
    const platformFee = await PlatformFee.findOne()
    if (!platformFee) {
      return res.status(404).json({ message: 'Platform fee not set.' })
    }
    res.status(200).json(platformFee)
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch platform fees',
      error: error.message,
    })
  }
}

// Update or create platform fees
const updatePlatformFees = async (req, res) => {
  try {
    const { propertyFee, carFee, boatFee, jewelryFee } = req.body

    // Validate input
    if (
      [propertyFee, carFee, boatFee, jewelryFee].some(
        (fee) => fee < 0 || fee > 100
      )
    ) {
      return res.status(400).json({
        message: 'Fees must be between 0% and 100%.',
      })
    }

    let platformFee = await PlatformFee.findOne()

    // If platform fees exist, update them
    if (platformFee) {
      platformFee.propertyFee = propertyFee
      platformFee.carFee = carFee
      platformFee.boatFee = boatFee
      platformFee.jewelryFee = jewelryFee
      await platformFee.save()
    } else {
      // Otherwise, create a new record
      platformFee = new PlatformFee({
        propertyFee,
        carFee,
        boatFee,
        jewelryFee,
      })
      await platformFee.save()
    }

    try {
      const NotificationData = {
        UserId: platformFee?.userId,
        userUUID: platformFee?.userUUID,
        UserRole: 'Admin',
        title: 'Platform Fee',
        message: `Platform Fee has been updated.`,
        RelateRoute: 'platform-fee',
        RelateId: platformFee?._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json({
      message: 'Platform fees updated successfully',
      platformFee,
    })
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update platform fees',
      error: error.message,
    })
  }
}
export { getPlatformFees, updatePlatformFees }
