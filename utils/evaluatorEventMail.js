import sendEmail from './nodeMailer.js'
import User from '../models/userModel.js'
import { safeURL } from '../controller/emailCtrl.js'
import {
  absoluteFrontendUrl,
  getEvaluatorListingPath,
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

function formatDateTime(value = new Date()) {
  return formatDubaiDateTime(value)
}

function listingDetailLines(listing, assetType) {
  const label = assetLabel(assetType || listing?.assetType)
  const lines = [
    `Asset type: <strong>${label}</strong>`,
    `Title: <strong>${listing?.title || 'listing'}</strong>`,
  ]

  const location = [listing?.neighbourhood, listing?.city, listing?.country]
    .filter(Boolean)
    .join(', ')
  if (location) lines.push(`Location: <strong>${location}</strong>`)
  if (listing?.price != null && listing.price !== '') {
    lines.push(`Price: <strong>${listing.price}</strong>`)
  }
  if (listing?.evaluationDateTime) {
    lines.push(
      `Evaluation slot: <strong>${formatDateTime(listing.evaluationDateTime)}</strong>`,
    )
  }
  return lines
}

function buildEmailHtml({ recipientName, headline, bodyLines = [], ctaLabel, ctaUrl }) {
  const name = recipientName || 'Evaluator'
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
        ${ctaLabel || 'Open Dashboard'}
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

async function resolveEvaluatorRecipients(listing) {
  const recipients = []

  if (listing?.evaluatorUUID) {
    const assigned = await User.findOne(
      {
        uuid: listing.evaluatorUUID,
        isDeleted: false,
        role: { $in: ['Evaluator', 'Sub-Evaluator'] },
      },
      { email: 1, name: 1, uuid: 1, role: 1 },
    )
    if (assigned?.email) recipients.push(assigned)
  }

  if (!recipients.length && listing?.evaluator) {
    const assigned = await User.findOne(
      {
        _id: listing.evaluator,
        isDeleted: false,
        role: { $in: ['Evaluator', 'Sub-Evaluator'] },
      },
      { email: 1, name: 1, uuid: 1, role: 1 },
    )
    if (assigned?.email) recipients.push(assigned)
  }

  // Fallback: all parent evaluators (same audience as role-wide dashboard alert)
  if (!recipients.length) {
    const evaluators = await User.find(
      {
        role: 'Evaluator',
        isDeleted: false,
        email: { $exists: true, $ne: '' },
      },
      { email: 1, name: 1, uuid: 1, role: 1 },
    )
    recipients.push(...evaluators)
  }

  return recipients
}

/**
 * Email evaluator(s) about a new evaluation request / listing.
 * Never throws.
 */
export async function notifyEvaluatorEvaluationRequest({
  listing,
  assetHolder,
  assetType,
}) {
  try {
    if (!listing) {
      return { success: false, message: 'Missing listing' }
    }

    if (
      !process.env.SMTP_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASS
    ) {
      return { success: false, message: 'Email is not configured on the server' }
    }

    const recipients = await resolveEvaluatorRecipients(listing)
    if (!recipients.length) {
      return { success: false, message: 'No evaluator email found' }
    }

    const holderName =
      displayName(assetHolder) ||
      listing?.evaluationContactName ||
      'Asset Holder'
    const holderEmail =
      assetHolder?.email || listing?.evaluationContactEmail || 'N/A'
    const label = assetLabel(assetType || listing.assetType)
    const title = listing.title || 'listing'

    const headline = `New evaluation request for ${label} "${title}".`
    const bodyLines = [
      `Asset holder name: <strong>${holderName}</strong>`,
      `Asset holder email: <strong>${holderEmail}</strong>`,
      ...listingDetailLines(listing, assetType),
      'This evaluation request was submitted by the asset holder.',
      'Status: <strong>Pending evaluation — not approved yet</strong>',
    ]

    const results = await Promise.all(
      recipients.map(async (evaluator) => {
        const recipientName = displayName(evaluator) || 'Evaluator'
        const listingPath = getEvaluatorListingPath(
          assetType || listing.assetType,
          listing.uuid,
          evaluator.role,
        )
        const evaluatorCtaUrl = absoluteFrontendUrl(listingPath)
        const result = await sendEmail({
          to: evaluator.email,
          subject: `New evaluation request — ${label} — Funds Verifier`,
          text: `Hi ${recipientName},\n\n${headline}\n\n${bodyLines
            .filter(Boolean)
            .join('\n')
            .replace(/<[^>]+>/g, '')}\n\nOpen listing:\n${evaluatorCtaUrl}\n`,
          html: buildEmailHtml({
            recipientName,
            headline,
            bodyLines,
            ctaLabel: 'Open Listing',
            ctaUrl: evaluatorCtaUrl,
          }),
        })
        return {
          email: evaluator.email,
          success: Boolean(result?.success),
        }
      }),
    )

    const sent = results.filter((r) => r.success).length
    return {
      success: sent > 0,
      message: sent > 0 ? `Sent to ${sent} evaluator(s)` : 'Failed to send',
      results,
    }
  } catch (error) {
    console.error(
      'notifyEvaluatorEvaluationRequest error:',
      error?.message || error,
    )
    return {
      success: false,
      message: error?.message || 'Failed to send email',
    }
  }
}
