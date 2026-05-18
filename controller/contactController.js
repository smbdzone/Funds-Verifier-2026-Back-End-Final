import nodemailer from 'nodemailer'
import ContactUs from '../models/Contact.js'
import sendEmail from '../utils/nodeMailer.js'
import { clean } from './emailCtrl.js'
import { sanitizeEmail } from '../utils/nosqlSanitizer.js'

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
