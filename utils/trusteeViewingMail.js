import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'

function buildEmailHtml({
  recipientName,
  headline,
  bodyLines = [],
  ctaLabel,
  ctaUrl,
}) {
  const name = recipientName || 'Trustee'
  const safeCta = safeURL(ctaUrl)
  const linesHtml = bodyLines
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.5;">${line}</p>`,
    )
    .join('')

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
                <p style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;">${headline}</p>
                ${linesHtml}
                <a href="${safeCta}"
                  style="display:inline-block;background:#eab308;color:#111827;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">
                  ${ctaLabel || 'Open Dashboard'}
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
 * Email the trustee when a viewing is booked on their slot.
 * Never throws.
 */
export default async function sendTrusteeViewingBookedEmail({
  trusteeUUID,
  buyerName,
  buyerEmail,
  assetHolderName,
  assetHolderEmail,
  listingTitle,
  assetType = 'property',
  slotDate,
  slotTime,
  message,
}) {
  try {
    if (!trusteeUUID) {
      return { success: false, message: 'Missing trustee UUID' }
    }

    const trustee = await User.findOne(
      { uuid: trusteeUUID, isDeleted: false },
      { email: 1, name: 1 },
    )

    if (!trustee?.email) {
      return { success: false, message: 'Trustee email not found' }
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
    const ctaUrl = `${frontendBase}/trustee`
    const assetLabel = String(assetType || 'property').toLowerCase()
    const recipientName = trustee.name || 'Trustee'
    const title = listingTitle || 'listing'
    const buyer = buyerName || 'A buyer'
    const whenParts = [slotDate, slotTime].filter(Boolean)

    const headline = `${buyer} requested a viewing for "${title}".`
    const bodyLines = [
      `Requester name: <strong>${buyer}</strong>`,
      buyerEmail ? `Requester email: <strong>${buyerEmail}</strong>` : null,
      assetHolderName
        ? `Asset holder name: <strong>${assetHolderName}</strong>`
        : null,
      assetHolderEmail
        ? `Asset holder email: <strong>${assetHolderEmail}</strong>`
        : null,
      `Asset type: <strong>${assetLabel}</strong>`,
      `Title: <strong>${title}</strong>`,
      whenParts.length
        ? `Viewing slot: <strong>${whenParts.join(' at ')}</strong>`
        : null,
      message ? `Message: <strong>${String(message).slice(0, 300)}</strong>` : null,
      'Status: <strong>Viewing requested — pending / not completed yet</strong>',
    ].filter(Boolean)

    const result = await sendEmail({
      to: trustee.email,
      subject: `New viewing request — ${assetLabel} — Funds Verifier`,
      text: `Hi ${recipientName},\n\n${headline}\n\n${bodyLines
        .join('\n')
        .replace(/<[^>]+>/g, '')}\n\nOpen dashboard:\n${ctaUrl}\n`,
      html: buildEmailHtml({
        recipientName,
        headline,
        bodyLines,
        ctaLabel: 'Open Trustee Dashboard',
        ctaUrl,
      }),
    })

    return {
      success: Boolean(result?.success),
      message: result?.success
        ? 'Trustee viewing email sent'
        : result?.error || 'Failed to send email',
      recipientEmail: trustee.email,
    }
  } catch (error) {
    console.error(
      'sendTrusteeViewingBookedEmail error:',
      error?.message || error,
    )
    return {
      success: false,
      message: error?.message || 'Failed to send trustee viewing email',
    }
  }
}
