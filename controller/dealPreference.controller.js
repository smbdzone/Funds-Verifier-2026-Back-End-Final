import DealPreference from '../models/dealPreference.model.js'

// Create a new deal preference
const createDealPreference = async (req, res) => {
  try {
    const requester = req.user

    if (!requester) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const payload = {
      ...req.body,
      userId: String(requester._id),
    }

    const dealPreference = new DealPreference(payload)
    await dealPreference.save()
    res.status(201).json(dealPreference)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get all deal preferences
const getAllDealPreferences = async (req, res) => {
  try {
    const dealPreferences = await DealPreference.find({ isDeleted: false })
    res.status(200).json(dealPreferences)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get a deal preference by ID (only owner or Admin)
const getDealPreferenceById = async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const dealPreference = await DealPreference.findById(req.params.id, {
      isDeleted: false,
    })
    if (!dealPreference) {
      return res.status(404).json({ error: 'Deal Preference not found' })
    }

    const isOwner = dealPreference.userId === String(requester._id)
    const isAdmin = requester.role === 'Admin'

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ error: 'Forbidden: Cannot access this deal preference' })
    }

    res.status(200).json(dealPreference)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Update a deal preference by ID (only owner or Admin)
const updateDealPreference = async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const existing = await DealPreference.findById(req.params.id, {
      isDeleted: false,
    })
    if (!existing) {
      return res.status(404).json({ error: 'Deal Preference not found' })
    }

    const isOwner = existing.userId === String(requester._id)
    const isAdmin = requester.role === 'Admin'

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ error: 'Forbidden: Cannot update this deal preference' })
    }

    const dealPreference = await DealPreference.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )

    res.status(200).json(dealPreference)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Delete a deal preference by ID (only owner or Admin)
const deleteDealPreference = async (req, res) => {
  try {
    const requester = req.user
    if (!requester) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const dealPreference = await DealPreference.findById(req.params.id)

    if (!dealPreference || dealPreference.isDeleted) {
      return res
        .status(404)
        .json({ error: 'Deal Preference not found or already deleted' })
    }

    const isOwner = dealPreference.userId === String(requester._id)
    const isAdmin = requester.role === 'Admin'

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ error: 'Forbidden: Cannot delete this deal preference' })
    }

    // Soft delete
    dealPreference.isDeleted = true
    dealPreference.deletedAt = new Date()
    await dealPreference.save()

    res.status(200).json({
      message: 'Deal Preference soft-deleted successfully',
      dealPreference,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

export {
  createDealPreference,
  getAllDealPreferences,
  getDealPreferenceById,
  updateDealPreference,
  deleteDealPreference,
}