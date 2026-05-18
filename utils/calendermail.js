// utils/contactmail.js
import nodemailer from 'nodemailer'
import { clean } from '../controller/emailCtrl.js'

// Create a transporter object using your email provider's service
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

const sendEmail = async ({ selectedDate, selectedTime, productData }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || 'simob@smbdigitalzone.com',
    subject: 'Scheduled booking',
    html: `
    <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="width: 80%; margin: 0 auto;">
          <h1 style="font-weight: bold; color: #002D4F; margin-top: 0;">Booking Details</h1>
          <p><strong>Date:</strong> ${clean(selectedDate)}</p>
          <p>Time: ${clean(selectedTime)}</p>
          <p>Product: ${clean(productData.title)}</p>
        </div>
      </body>
    </html>

   `,
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
}

export default sendEmail
