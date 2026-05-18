import nodemailer from 'nodemailer'
import asyncHandler from 'express-async-handler'

const sendEmail = asyncHandler(async (data, req, res) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // email-smtp.us-west-2.amazonaws.com
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER, // SES SMTP username (AKIA...)
      pass: process.env.EMAIL_PASS, // SES SMTP password
    },
  })

  try {
    const info = await transporter.sendMail({
      from:
        process.env.EMAIL_FROM || `"Funds Verifier" <info@fundsverifier.com>`, // MUST use verified domain
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });

    console.log("Message sent: %s", info.messageId);
    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

    // Preview only available when sending through an Ethereal account
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
});

export default sendEmail;
