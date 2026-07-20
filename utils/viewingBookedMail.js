import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'

function buildEmailHtml({
  recipientName,
  buyerName,
  listingTitle,
  assetLabel,
  viewingUrl,
  slotDate,
  slotTime,
}) {
  const name = recipientName || 'Asset Holder'
  const safeViewUrl = safeURL(viewingUrl)
  const whenLine =
    slotDate || slotTime
      ? `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
          Scheduled:${slotDate ? ` <strong>${slotDate}</strong>` : ''}${slotTime ? ` at <strong>${slotTime}</strong>` : ''
      }
        </p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="background-color:#ffffff;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,Cantarell,'Helvetica Neue',sans-serif;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#0f2744;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:600;">
                Funds Verifier
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${name},</p>
                <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.5;">
                  <strong>${buyerName || 'A buyer'}</strong> booked a viewing for your
                  ${assetLabel} <strong>${listingTitle || 'listing'}</strong>.
                </p>
                ${whenLine}
                <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">
                  Open Arrange Viewing on your dashboard to review the booking.
                </p>
                <a href="${safeViewUrl}"
                  style="display:inline-block;background:#eab308;color:#111827;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">
                  View Bookings
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;">
                This is an automated message from Funds Verifier.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Email the asset holder when someone books a viewing for their listing.
 * Never throws — safe to call from booking services.
 */
export default async function sendViewingBookedEmail({
  userUUID,
  buyerName,
  listingTitle,
  assetType = 'property',
  slotDate,
  slotTime,
}) {
  try {
    if (!userUUID) {
      return { success: false, message: 'Missing asset holder UUID' }
    }

    const assetHolder = await User.findOne(
      { uuid: userUUID, isDeleted: false },
      { email: 1, name: 1 },
    )

    if (!assetHolder?.email) {
      return { success: false, message: 'Asset holder email not found' }
    }

    if (
      !process.env.SMTP_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS
    ) {
      return { success: false, message: 'Email is not configured on the server' }
    }

    const frontendBase = String(
      process.env.FRONTEND_URL || 'https://fundsverifier.com',
    ).replace(/\/$/, '')
    const viewingUrl = `${frontendBase}/seller-profile/all-slot`
    const assetLabel = String(assetType || 'property').toLowerCase()
    const recipientName = assetHolder.name || ''
    const title = listingTitle || 'listing'
    const buyer = buyerName || 'A buyer'

    const result = await sendEmail({
      to: assetHolder.email,
      subject: `Viewing booked for your ${assetLabel} — Funds Verifier`,
      text: `Hi ${recipientName || 'Asset Holder'},\n\n${buyer} booked a viewing for your ${assetLabel} "${title}".${slotDate || slotTime
          ? `\n\nScheduled: ${[slotDate, slotTime].filter(Boolean).join(' at ')}`
          : ''
        }\n\nReview bookings here:\n${viewingUrl}\n`,
      html: buildEmailHtml({
        recipientName,
        buyerName: buyer,
        listingTitle: title,
        assetLabel,
        viewingUrl,
        slotDate,
        slotTime,
      }),
    })

    return {
      success: Boolean(result?.success),
      message: result?.success
        ? 'Viewing booked email sent'
        : result?.error || 'Failed to send email',
      recipientEmail: assetHolder.email,
    }
  } catch (error) {
    console.error('sendViewingBookedEmail error:', error?.message || error)
    return {
      success: false,
      message: error?.message || 'Failed to send viewing booked email',
    }
  }
}
