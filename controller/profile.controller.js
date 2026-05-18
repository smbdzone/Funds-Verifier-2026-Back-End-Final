import Profile from '../models/profile.model.js'

// Create a new profile
const createProfile = async (req, res) => {
  try {
    const profile = new Profile(req.body)
    await profile.save()
    res.status(201).json(profile)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get all profiles
const getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find({ isDeleted: false })
    res.status(200).json(profiles)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get a profile by ID
const getProfileById = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id, { isDeleted: false })
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }
    res.status(200).json(profile)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Update a profile by ID
const updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    })
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }
    res.status(200).json(profile)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Delete a profile by ID
const deleteProfile = async (req, res) => {
  try {
    const profile = await Profile.findByIdAndDelete(req.params.id, {
      isDeleted: false,
    })
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }
    res.status(200).json({ message: 'Profile deleted successfully' })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

export {
  createProfile,
  getAllProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
}
