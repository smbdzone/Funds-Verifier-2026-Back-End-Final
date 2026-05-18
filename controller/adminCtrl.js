import User from '../models/adminModel.js'
import { createNotification } from '../controller/notifications.controller.js'

export const updateProfileImage = async (req, res) => {
  const { imageUrl, userId } = req.body

  try {
    const user = await User.findOne({ isDeleted: false })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update the profile image for the found user
    user.profileImage = imageUrl
    const updatedUser = await new User({
      profileImage: imageUrl,
    })

    try {
      const NotificationData = {
        userId: user?.userId,
        userUUID: user?.uuid,
        UserRole: 'Admin',
        title: 'Profile',
        message: `Your proflie image has beed updated.`,
        RelateRoute: 'profile',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({
      message: 'Profile image updated successfully',
      user: updatedUser,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile image', error })
  }
}

export const getProfileImage = async (req, res) => {
  try {
    const user = await User.findOne({ isDeleted: false })
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.status(200).json({ profileImage: user.profileImage })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile image', error })
  }
}
