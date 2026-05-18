import ElectronicConsent from '../models/electronicConsent.model.js'

// Create a new electronic consent
const createElectronicConsent = async (req, res) => {
  try {
    const electronicConsent = new ElectronicConsent(req.body)
    await electronicConsent.save()
    res.status(201).json(electronicConsent)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get all electronic consents
const getAllElectronicConsents = async (req, res) => {
  try {
    const electronicConsents = await ElectronicConsent.find({
      isDeleted: false,
    })
    res.status(200).json(electronicConsents)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Get an electronic consent by ID
const getElectronicConsentById = async (req, res) => {
  try {
    const electronicConsent = await ElectronicConsent.findById(req.params.id, {
      isDeleted: false,
    })
    if (!electronicConsent) {
      return res.status(404).json({ error: 'Electronic Consent not found' })
    }
    res.status(200).json(electronicConsent)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Update an electronic consent by ID
const updateElectronicConsent = async (req, res) => {
  try {
    const electronicConsent = await ElectronicConsent.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!electronicConsent) {
      return res.status(404).json({ error: 'Electronic Consent not found' })
    }
    res.status(200).json(electronicConsent)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

// Delete an electronic consent by ID
const deleteElectronicConsent = async (req, res) => {
  try {
    const electronicConsent = await ElectronicConsent.findById(req.params.id, {
      isDeleted: false,
    })

    if (!electronicConsent || electronicConsent.isDeleted) {
      return res
        .status(404)
        .json({ error: 'Electronic Consent not found or already deleted' })
    }

    // Soft delete
    electronicConsent.isDeleted = true
    electronicConsent.deletedAt = new Date()
    await electronicConsent.save()

    res.status(200).json({
      message: 'Electronic Consent soft-deleted successfully',
      electronicConsent,
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}

export {
  createElectronicConsent,
  getAllElectronicConsents,
  getElectronicConsentById,
  updateElectronicConsent,
  deleteElectronicConsent,
}
