import nodemailer from 'nodemailer'
import { safeURL } from '../../controller/emailCtrl.js'
export default async function SendAssetTransferingMail({
  PaymentUrl,
  assetName,
  assetLink,
  AssetHolder,
  broker,
}) {
  try {
    if (!broker?.email) throw new Error('Broker email is required@')

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: broker?.email,
      // to: "ranazain3431@gmail.com",
      subject: 'Asset Transfer Payment',
      html: SendMailTemplate({
        assetLink,
        assetName: assetName,
        brokerName: broker?.name || '',
        PaymentUrl,
      }),
    }

    await transporter.sendMail(mailOptions)
    return { success: true, message: 'Asset transfer email sent successfully.' }
  } catch (error) {
    console.error('Error sending asset transfer email:', error)
    return { success: false, message: 'Failed to send asset transfer email.' }
  }
}

const SendMailTemplate = ({ PaymentUrl, brokerName, assetLink, assetName }) => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body
    style="
      background-color: #ffffff;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
    "
  >
    <table
      width="100%"
      border="0"
      cellpadding="0"
      cellspacing="0"
      align="center"
      style="max-width: 600px; margin: 0 auto; padding: 20px"
    >
      <tr>
        <td>
          <p style="font-size: 16px; line-height: 26px; margin: 16px 0">
            Hi ${cleans(brokerName) || 'User'},
          </p>

          <p style="font-size: 16px; line-height: 26px; margin: 16px 0">
            As part of the closing process for the asset transaction
            <a
              href="${safeURL(assetLink) || '#'}"
              target="_blank"
              style="color: #000; text-decoration: none; font-weight: bold"
            >
              ${clean(assetName) || 'Asset'} </a
            >, please note that the <strong>success fee</strong> must be settled
            before the transfer can proceed. This fee may either be:
          </p>

          <p style="font-size: 16px; line-height: 26px; margin: 16px 0">
            To avoid delays in completing the transfer, kindly ensure that the
            success fee is paid and proof of payment is provided at your
            earliest convenience.
          </p>

          <table
            border="0"
            cellpadding="0"
            cellspacing="0"
            align="center"
            style="margin: 20px auto"
          >
            <tr>
              <td align="center">
                <a
                  href="${safeURL(PaymentUrl) || '#'}"
                  target="_blank"
                  style="
                    background-color: #e7ad01;
                    color: #ffffff;
                    font-size: 16px;
                    text-decoration: none;
                    padding: 12px 20px;
                    border-radius: 4px;
                    display: inline-block;
                  "
                >
                  Pay Success Fee
                </a>
              </td>
            </tr>
          </table>
          <hr
            style="border: none; border-top: 1px solid #cccccc; margin: 20px 0"
          />

          <p style="font-size: 16px; line-height: 26px; margin: 24px 0 16px 0">
            Best regards,<br />
            Funds Verifier
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`
}
