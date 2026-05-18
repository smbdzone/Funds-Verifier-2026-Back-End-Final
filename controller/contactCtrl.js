import asyncHandler from 'express-async-handler'
import validateMongoId from '../utils/validateMongodbId.js'
import Contact from '../models/contactModel.js'
import { createNotification } from './notifications.controller.js'

const createContact = asyncHandler(async (req, res) => {
  const userId = req.query.userId

  try {
    const contact = await Contact.create(req.body)

    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Contact',
        message: `New contact is added.`,
        RelateRoute: 'contact',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }
    res.status(200).json(contact)
    return
  } catch (err) {
    res.status(500).json({ error: err?.message, message: err?.message })
    return
  }
})

const updateContact = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)
    const contact = await Contact.findByIdAndUpdate(id, req.body, {
      new: true,
    })
    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Contact',
        message: `A contact is updated.`,
        RelateRoute: 'contact',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.status(200).json(contact)
    return
  } catch (err) {
    res.status(500).json({ error: err?.message, message: err?.message })
    return
  }
})

const DeleteContact = asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.query.userId

  try {
    validateMongoId(id)

    const contact = await Contact.findById(id, { isDeleted: false })

    if (!contact || contact.isDeleted) {
      return res
        .status(404)
        .json({ message: 'Contact not found or already deleted' })
    }

    // Soft delete
    contact.isDeleted = true
    contact.deletedAt = new Date()
    await contact.save()

    // Send notification
    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Contact',
        message: `A contact has been deleted.`,
        RelateRoute: 'contact',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    res.json({ message: 'Contact soft-deleted successfully', contact })
  } catch (err) {
    res.status(500).json({ error: err?.message, message: err?.message })
  }
})

const getSingleContact = asyncHandler(async (req, res) => {
  const { id } = req.params
  try {
    validateMongoId(id)
    const contact = await Contact.findById(id, { isDeleted: false })
    res.json(contact)
  } catch (err) {
    return res.status(500).json(err)
  }
})

const getAllContact = asyncHandler(async (req, res) => {
  try {
    const contact = await Contact.find({ isDeleted: false })
    res.json(contact)
  } catch (err) {
    throw new Error(err)
  }
})
export {
  createContact,
  DeleteContact,
  getSingleContact,
  getAllContact,
  updateContact,
}
