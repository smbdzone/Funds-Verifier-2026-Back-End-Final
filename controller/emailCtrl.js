import asyncHandler from 'express-async-handler'
import sendEmail from '../utils/nodeMailer.js'
import sanitizeHtml from 'sanitize-html'

export const safeURL = (url) => {
  const regex = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i
  return regex.test(url) ? url : '#'
}

export const clean = (value) =>
  sanitizeHtml(value, {
    allowedTags: [], // deny all HTML tags
    allowedAttributes: {},
  })

const sendMail = asyncHandler(async (req, res) => {
  try {
    const { email, subject, text } = req.body

    const result = await sendEmail({
      to: email,
      subject: clean(subject),
      text: text,
    })

    if (!result.success) {
      return res
        .status(503)
        .json({ success: false, message: 'Failed to send email' })
    }

    res.status(200).json({ success: true, message: 'Email sent successfully' })
  } catch (error) {
    // Handle the error appropriately
    console.error('Error sending email:', error)
    res.status(500).json({ success: false, message: 'Failed to send email' })
  }
})

export { sendMail }
