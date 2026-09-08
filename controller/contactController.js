import mongoose from 'mongoose'
import ContactUs from '../models/Contact.js'
import sendEmail from '../utils/nodeMailer.js'
import { clean } from './emailCtrl.js'
import { sanitizeEmail } from '../utils/nosqlSanitizer.js'

async function findContactUsByIdParam(id) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    const byId = await ContactUs.findOne({ _id: id, isDeleted: false })
    if (byId) return byId
  }
  return ContactUs.findOne({ uuid: id, isDeleted: false })
}

export const getAllContactUs = async (req, res) => {
  try {
    const contacts = await ContactUs.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .select('-__v')

    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts',
      error: error.message,
    })
  }
}

export const getContactUsById = async (req, res) => {
  try {
    const contact = await findContactUsByIdParam(req.params.id)

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      })
    }

    res.status(200).json({ success: true, data: contact })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact',
      error: error.message,
    })
  }
}

export const updateContactUs = async (req, res) => {
  try {
    const contact = await findContactUsByIdParam(req.params.id)

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      })
    }

    const { fullName, email, subject, phone, message } = req.body

    if (email !== undefined) {
      const sanitizedEmail = sanitizeEmail(email)
      if (!sanitizedEmail) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        })
      }
      contact.email = sanitizedEmail
    }

    if (fullName !== undefined) {
      if (fullName.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Full name must not exceed 200 characters',
        })
      }
      contact.fullName = fullName
    }

    if (subject !== undefined) {
      if (subject.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Subject must not exceed 200 characters',
        })
      }
      contact.subject = subject
    }

    if (phone !== undefined) {
      contact.phone = phone
    }

    if (message !== undefined) {
      if (message.length > 5000) {
        return res.status(400).json({
          success: false,
          message: 'Message must not exceed 5000 characters',
        })
      }
      contact.message = message
    }

    await contact.save()

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: contact,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update contact',
      error: error.message,
    })
  }
}

export const deleteContactUs = async (req, res) => {
  try {
    const contact = await findContactUsByIdParam(req.params.id)

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found or already deleted',
      })
    }

    contact.isDeleted = true
    contact.deletedAt = new Date()
    await contact.save()

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact',
      error: error.message,
    })
  }
}

export const createContact = async (req, res) => {
  try {
    const { fullName, email, subject, phone, message } = req.body

    const sanitizedEmail = sanitizeEmail(email)
    if (!sanitizedEmail) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      })
    }

    if (fullName && fullName.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Full name must not exceed 200 characters',
      })
    }
    if (subject && subject.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Subject must not exceed 200 characters',
      })
    }
    if (message && message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message must not exceed 5000 characters',
      })
    }

    const newContact = await ContactUs.create({
      fullName,
      email: sanitizedEmail,
      subject,
      phone,
      message,
    })

    // Nodemailer Configuration
    sendEmail({
      to: email,
      subject: clean(subject),
      html: `
        <h2>You have a new contact request</h2>
        <p><strong>Full Name:</strong> ${clean(fullName)}</p>
        <p><strong>Email:</strong> ${clean(email)}</p>
        <p><strong>Phone:</strong> ${clean(phone)}</p>
        <p><strong>Subject:</strong> ${clean(subject)}</p>
        <p><strong>Message:</strong> ${clean(message)}</p>
      `,
    }).then((result) => {
      if (!result.success) {
        console.warn(`Contact notification email failed: ${result.error}`)
      }
    })

    res
      .status(200)
      .json({ success: true, message: 'Message sent successfully' })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Failed to send message', error })
  }
}
