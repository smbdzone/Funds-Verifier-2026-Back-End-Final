import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'

function getRequesterLabel(role) {
  const r = String(role || '').toLowerCase()
  if (r === 'trustee') return 'Trustee'
  if (r === 'admin') return 'Admin'
  if (r === 'sub-evaluator' || r === 'subevaluator') return 'Sub-Evaluator'
  return 'Evaluator'
}

function buildDocumentsListHtml(documentNames = []) {
  if (!documentNames.length) {
    return '<p style="margin:0 0 16px;color:#374151;">Additional documents were requested for your listing.</p>'
  }
  const items = documentNames
    .map(
      (name) =>
        `<li style="margin:0 0 6px;color:#374151;">${String(name)}</li>`,
    )
    .join('')
  return `
    <p style="margin:0 0 8px;color:#374151;">Requested documents:</p>
    <ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>
  `
}

function buildEmailHtml({
  recipientName,
  assetTitle,
  assetLabel,
  requesterLabel,
  documentNames,
  documentsUrl,
}) {
  const name = recipientName || 'Asset Holder'
  const safeDocsUrl = safeURL(documentsUrl)

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
                  A <strong>${requesterLabel}</strong> has requested document(s) for your
                  ${assetLabel} <strong>${assetTitle || 'listing'}</strong>.
                </p>
                ${buildDocumentsListHtml(documentNames)}
                <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.5;">
                  Please upload the requested files in Documents Storage on your dashboard.
                </p>
                <a href="${safeDocsUrl}"
                  style="display:inline-block;background:#eab308;color:#111827;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">
                  Upload Documents
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
 * Email the asset holder when an evaluator/trustee requests documents.
 * Never throws — safe to call from update controllers.
 */
export default async function sendDocumentRequestedEmail({
  userUUID,
  assetTitle,
  assetType = 'property',
  requesterRole,
  documentNames = [],
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

    const requesterLabel = getRequesterLabel(requesterRole)
    const frontendBase = String(
      process.env.FRONTEND_URL || 'https://fundsverifier.com',
    ).replace(/\/$/, '')
    const documentsUrl = `${frontendBase}/seller-profile/documents-storage`
    const assetLabel = String(assetType || 'property').toLowerCase()
    const recipientName = assetHolder.name || ''

    const namesText =
      documentNames.length > 0
        ? documentNames.map((n) => `- ${n}`).join('\n')
        : '- (see Documents Storage)'

    const result = await sendEmail({
      to: assetHolder.email,
      subject: `Document requested for your ${assetLabel} — Funds Verifier`,
      text: `Hi ${recipientName || 'Asset Holder'},\n\nA ${requesterLabel} requested document(s) for your ${assetLabel} "${assetTitle || 'listing'}".\n\nRequested documents:\n${namesText}\n\nPlease upload them here:\n${documentsUrl}\n`,
      html: buildEmailHtml({
        recipientName,
        assetTitle,
        assetLabel,
        requesterLabel,
        documentNames,
        documentsUrl,
      }),
    })

    return {
      success: Boolean(result?.success),
      message: result?.success
        ? 'Document request email sent'
        : result?.error || 'Failed to send email',
      recipientEmail: assetHolder.email,
    }
  } catch (error) {
    console.error(
      'sendDocumentRequestedEmail error:',
      error?.message || error,
    )
    return {
      success: false,
      message: error?.message || 'Failed to send document request email',
    }
  }
}

export { getRequesterLabel }
