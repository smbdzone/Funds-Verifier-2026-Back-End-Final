// utils/contactmail.js
import nodemailer from 'nodemailer'

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

const sendEmail = async ({ name, email, message }) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'New Contact Form Submission',
    html: `
    <html>
  <body style="font-family: Arial, sans-serif;">
    <div style="width: 80%; margin: 0 auto;">
      <div style="text-align: center;">
        <div style="height: 20px; background-color: #002D4F; width: 100%;"></div>
        <br>
        <div style="background-color: #002D4F; color:white display: inline-block; border-radius: 50%; padding: 1px; margin-top: -10px;">
          <p style="font-size: 10px; color: white; border: 2px solid #002D4F; border-radius: 50%; display: inline-block; padding: 1px; margin: 0;">&#10004;</p> <!-- Check mark icon -->
        </div>
        <h1 style="font-weight: bold; color: #002D4F; margin-top: 0;">Thank You</h1>
        <p style="color: #013760; ">for contacting us</p>
      </div>
      <div style="color: #002D4F; text-align: left;">
        <p>Dear ${clean(name)},</p>
        <p>Thank you for reaching out to us! We'd love to hear from you and help with any questions or concerns you may have.</p>
        <p>Please feel free to contact us using the information below:</p>
        <p>Alternatively, you can fill out the form on our website: [insert website URL]</p>
        <p>We'll respond to your inquiry as soon as possible. If you have any urgent matters, please don't hesitate to let us know.</p>
        <p>Thank you for your interest, and we look forward to connecting with you!</p>
        <p>Best regards,</p>
        <p>Simo Berreda</p>
        <p><strong>SMB Digital Zone</strong></p>
      </div>
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
