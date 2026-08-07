import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'

function buildEmailHtml({
  recipientName,
  headline,
  bodyLines = [],
  ctaLabel,
  ctaUrl,
  previewImageUrl,
}) {
  const name = recipientName || 'Asset Holder'
  const safeCta = safeURL(ctaUrl)
  const safePreview = previewImageUrl ? safeURL(previewImageUrl) : '#'
  const previewHtml =
    previewImageUrl && safePreview !== '#'
      ? `<img src="${safePreview}" alt="Listing preview" width="512"
          style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;margin:0 0 16px;border:1px solid #e5e7eb;" />`
      : ''
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
                ${previewHtml}
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
 * Generic asset-holder event email. Never throws.
 */
export default async function sendAssetHolderEventEmail({
  userUUID,
  subject,
  headline,
  bodyLines = [],
  ctaLabel = 'View My Listings',
  ctaPath = '/seller-profile/my-listing',
  ctaUrl: ctaUrlOverride,
  previewImageUrl,
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
    const ctaUrl =
      (typeof ctaUrlOverride === 'string' && ctaUrlOverride.trim()) ||
      `${frontendBase}${ctaPath.startsWith('/') ? ctaPath : `/${ctaPath}`}`
    const recipientName = assetHolder.name || ''

    const result = await sendEmail({
      to: assetHolder.email,
      subject,
      text: `Hi ${recipientName || 'Asset Holder'},\n\n${headline}\n\n${bodyLines
        .filter(Boolean)
        .join('\n')
        .replace(/<[^>]+>/g, '')}\n\n${ctaLabel}:\n${ctaUrl}\n`,
      html: buildEmailHtml({
        recipientName,
        headline,
        bodyLines,
        ctaLabel,
        ctaUrl,
        previewImageUrl,
      }),
    })

    return {
      success: Boolean(result?.success),
      message: result?.success
        ? 'Email sent'
        : result?.error || 'Failed to send email',
      recipientEmail: assetHolder.email,
    }
  } catch (error) {
    console.error('sendAssetHolderEventEmail error:', error?.message || error)
    return {
      success: false,
      message: error?.message || 'Failed to send email',
    }
  }
}
