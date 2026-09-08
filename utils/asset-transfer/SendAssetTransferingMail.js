import sendEmail from '../nodeMailer.js'
import { safeURL } from '../../controller/emailCtrl.js'

export default async function SendAssetTransferingMail({
  PaymentUrl,
  assetName,
  assetLink,
  AssetHolder,
  broker,
}) {
  const recipient = AssetHolder?.email
    ? AssetHolder
    : broker?.email
      ? broker
      : null

  if (!recipient?.email) {
    return {
      success: false,
      message: 'Asset holder email is required for success fee payment.',
      recipientEmail: null,
    }
  }

  if (!process.env.SMTP_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return {
      success: false,
      message: 'Email is not configured on the server (SMTP). Share the payment link manually.',
      recipientEmail: recipient.email,
    }
  }

  const result = await sendEmail({
    to: recipient.email,
    subject: 'Success Fee Payment — Asset Transfer',
    text: `Pay the success fee for ${assetName || 'your asset'}: ${PaymentUrl}`,
    html: SendMailTemplate({
      assetLink,
      assetName: assetName,
      recipientName: recipient?.name || AssetHolder?.name || broker?.name || '',
      PaymentUrl,
    }),
  })

  if (!result.success) {
    return {
      success: false,
      message: result.error || 'Failed to send asset transfer email.',
      recipientEmail: recipient.email,
    }
  }

  return {
    success: true,
    message: 'Asset transfer email sent successfully.',
    recipientEmail: recipient.email,
  }
}

const SendMailTemplate = ({ PaymentUrl, recipientName, assetLink, assetName }) => {
  const name = recipientName || 'User'
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
            Hi ${name},
          </p>

          <p style="font-size: 16px; line-height: 26px; margin: 16px 0">
            As part of the closing process for the asset transaction
            <a
              href="${safeURL(assetLink) || '#'}"
              target="_blank"
              style="color: #000; text-decoration: none; font-weight: bold"
            >
              ${assetName || 'Asset'} </a
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
