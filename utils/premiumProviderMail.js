import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'
import {
  absoluteFrontendUrl,
  getTechnicalReportRequestPath,
  getWalkthroughRequestPath,
} from './listingDeepLinks.js'
import { formatDubaiDateTime } from './dubaiDateTime.js'

function displayName(userOrName) {
  if (!userOrName) return ''
  if (typeof userOrName === 'string') return userOrName.trim()
  return (
    userOrName.name ||
    userOrName.displayName ||
    userOrName.email ||
    ''
  ).trim()
}

function assetLabel(assetType) {
  const t = String(assetType || 'asset').toLowerCase()
  if (t.includes('off plan')) return 'off-plan property'
  if (t.includes('property')) return 'property'
  if (t.includes('car')) return 'car'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewelry'
  return t || 'asset'
}

function formatDateTime(value) {
  if (!value) return ''
  return formatDubaiDateTime(value)
}

function buildEmailHtml({ recipientName, headline, bodyLines = [], ctaLabel, ctaUrl }) {
  const name = recipientName || 'Provider'
  const safeCta = safeURL(ctaUrl)
  const linesHtml = bodyLines
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.5;">${line}</p>`,
    )
    .join('')

  const ctaHtml = safeCta
    ? `<a href="${safeCta}"
        style="display:inline-block;background:#eab308;color:#111827;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">
        ${ctaLabel || 'Open Request'}
      </a>`
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
                <p style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;">${headline}</p>
                ${linesHtml}
                ${ctaHtml}
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

async function resolveProvidersByRole(role) {
  return User.find(
    {
      role,
      isDeleted: false,
      email: { $exists: true, $ne: '' },
    },
    { email: 1, name: 1, uuid: 1, role: 1 },
  )
}

/**
 * Email technical report / 3D walkthrough providers about a new request.
 * Includes deep link into their dashboard for that request.
 */
export async function notifyPremiumProviderRequest({
  serviceType,
  request,
  listing,
}) {
  try {
    if (!request) {
      return { success: false, message: 'Missing request' }
    }

    if (
      !process.env.SMTP_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS
    ) {
      return { success: false, message: 'Email is not configured on the server' }
    }

    const isWalkthrough =
      String(serviceType || '')
        .toLowerCase()
        .includes('walk') ||
      String(serviceType || '')
        .toLowerCase()
        .includes('3d')

    const role = isWalkthrough ? '3dWalkthrough' : 'TechnicalReport'
    const serviceLabel = isWalkthrough ? '3D walkthrough' : 'technical report'
    const providers = await resolveProvidersByRole(role)

    if (!providers?.length) {
      return { success: false, message: `No ${role} providers found` }
    }

    const holderName = displayName(request?.name) || 'Asset Holder'
    const holderEmail = request?.email || 'N/A'
    const label = assetLabel(request?.assetType || listing?.assetType)
    const title =
      listing?.title || request?.productTitle || request?.title || 'listing'
    const requestUuid = request?.uuid
    const ctaPath = isWalkthrough
      ? getWalkthroughRequestPath(requestUuid)
      : getTechnicalReportRequestPath(requestUuid)
    const ctaUrl = absoluteFrontendUrl(ctaPath)

    const headline = `New ${serviceLabel} request for ${label} "${title}".`
    const bodyLines = [
      `Service: <strong>${serviceLabel}</strong>`,
      `Asset holder name: <strong>${holderName}</strong>`,
      `Asset holder email: <strong>${holderEmail}</strong>`,
      `Asset type: <strong>${label}</strong>`,
      `Title: <strong>${title}</strong>`,
      request?.phone ? `Phone: <strong>${request.phone}</strong>` : null,
      request?.dateTime
        ? `Booked slot: <strong>${formatDateTime(request.dateTime)}</strong>`
        : null,
      request?.price != null && request.price !== ''
        ? `Price: <strong>${request.price}</strong>`
        : null,
      'Status: <strong>Requested — pending delivery</strong>',
      'Click the button below to open this request on your dashboard.',
    ].filter(Boolean)

    const results = await Promise.all(
      providers.map(async (provider) => {
        const recipientName = displayName(provider) || 'Provider'
        const result = await sendEmail({
          to: provider.email,
          subject: `New ${serviceLabel} request — Funds Verifier`,
          text: `Hi ${recipientName},\n\n${headline}\n\n${bodyLines
            .join('\n')
            .replace(/<[^>]+>/g, '')}\n\nOpen request:\n${ctaUrl}\n`,
          html: buildEmailHtml({
            recipientName,
            headline,
            bodyLines,
            ctaLabel: 'Open Request',
            ctaUrl,
          }),
        })
        return {
          email: provider.email,
          success: Boolean(result?.success),
        }
      }),
    )

    const sent = results.filter((r) => r.success).length
    return {
      success: sent > 0,
      message: sent > 0 ? `Sent to ${sent} provider(s)` : 'Failed to send',
      results,
    }
  } catch (error) {
    console.error(
      'notifyPremiumProviderRequest error:',
      error?.message || error,
    )
    return {
      success: false,
      message: error?.message || 'Failed to send email',
    }
  }
}
