import nodemailer from 'nodemailer'

/**
 * Send mail via SES SMTP. Never throws — returns { success, error?, messageId? }
 * so a DNS/network outage cannot crash the API process.
 */
const sendEmail = async (data) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })

  try {
    const info = await transporter.sendMail({
      from:
        process.env.EMAIL_FROM || `"Funds Verifier" <info@fundsverifier.com>`,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    })

    console.log('Message sent: %s', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error?.message || error)
    return {
      success: false,
      error: error?.message || 'Failed to send email',
    }
  }
}

export default sendEmail
