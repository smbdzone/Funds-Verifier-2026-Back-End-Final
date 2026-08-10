import sendEmail from './nodeMailer.js'
import { safeURL } from '../controller/emailCtrl.js'
import { formatDubaiDateTime } from './dubaiDateTime.js'
import {
  buildEmailPreviewImageHtml,
  resolveListingEmailPreviewUrl,
} from './listingEmailPreview.js'

export function getFvEmail() {
  return String(process.env.FV_EMAIL || '').trim()
}

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

function buildEmailHtml({ recipientName, headline, bodyLines = [], ctaLabel, ctaUrl, previewImageUrl }) {
  const name = recipientName || 'FV Portal'
  const safeCta = safeURL(ctaUrl)
  const previewHtml = buildEmailPreviewImageHtml(previewImageUrl, safeURL)
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
            ${
              previewHtml
                ? `<tr>
              <td style="padding:0;font-size:0;line-height:0;">
                ${previewHtml}
              </td>
            </tr>`
                : ''
            }
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

/**
 * Send email to FV portal address (FV_EMAIL). Never throws.
 */
export async function sendFvPortalEmail({
  subject,
  headline,
  bodyLines = [],
  ctaLabel,
  ctaPath,
  previewImageUrl,
}) {
  try {
    const to = getFvEmail()
    if (!to) {
      return { success: false, message: 'FV_EMAIL is not configured' }
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
    const ctaUrl = ctaPath
      ? `${frontendBase}${ctaPath.startsWith('/') ? ctaPath : `/${ctaPath}`}`
      : undefined

    const result = await sendEmail({
      to,
      subject,
      text: `Hi FV Portal,\n\n${headline}\n\n${bodyLines
        .filter(Boolean)
        .join('\n')
        .replace(/<[^>]+>/g, '')}\n`,
      html: buildEmailHtml({
        recipientName: 'FV Portal',
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
      recipientEmail: to,
    }
  } catch (error) {
    console.error('sendFvPortalEmail error:', error?.message || error)
    return {
      success: false,
      message: error?.message || 'Failed to send email',
    }
  }
}

/**
 * Listing just posted — awaiting evaluation / Super Admin / not approved yet.
 */
export async function notifyFvListingPosted({
  listing,
  assetHolder,
  assetType,
}) {
  if (!listing) return { success: false, message: 'Missing listing' }

  const holderName = displayName(assetHolder) || 'Asset Holder'
  const holderEmail = assetHolder?.email || listing?.evaluationContactEmail || 'N/A'
  const label = assetLabel(assetType || listing.assetType)
  const isOffPlan = String(assetType || listing?.assetType || '')
    .toLowerCase()
    .includes('off plan')

  const statusLine = isOffPlan
    ? 'Status: <strong>Posted — pending Super Admin approval / not approved yet</strong>'
    : 'Status: <strong>Posted — awaiting evaluation / not approved yet</strong>'

  const extraLine = isOffPlan
    ? 'This off-plan listing was submitted by the asset holder and needs Super Admin approval before it goes live.'
    : listing?.evaluationDateTime
      ? 'An evaluation request was submitted by the asset holder with the slot above.'
      : 'An evaluation request may follow once the asset holder books a slot.'

  return sendFvPortalEmail({
    subject: isOffPlan
      ? `New off-plan listing posted (pending Super Admin approval) — Funds Verifier`
      : `New ${label} listing posted (pending evaluation) — Funds Verifier`,
    headline: isOffPlan
      ? `A new off-plan listing was just posted and is not approved yet.`
      : `A new ${label} was just posted and is not approved yet.`,
    bodyLines: [
      `Asset holder name: <strong>${holderName}</strong>`,
      `Asset holder email: <strong>${holderEmail}</strong>`,
      ...listingDetailLines(listing, assetType),
      statusLine,
      extraLine,
    ],
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })
}

/**
 * Evaluator approved the listing — notify FV with evaluator + date/time.
 */
export async function notifyFvListingApproved({
  listing,
  assetHolder,
  assetType,
  evaluator,
  approvedAt = new Date(),
}) {
  if (!listing) return { success: false, message: 'Missing listing' }

  const holderName = displayName(assetHolder) || 'Asset Holder'
  const holderEmail = assetHolder?.email || 'N/A'
  const evaluatorName = displayName(evaluator) || 'Evaluator'
  const label = assetLabel(assetType || listing.assetType)
  const title = listing.title || 'listing'
  const when = formatDateTime(approvedAt)
  const previewImageUrl = await resolveListingEmailPreviewUrl(
    listing,
    assetType || listing.assetType,
  )

  return sendFvPortalEmail({
    subject: `Listing approved — ${label} — Funds Verifier`,
    headline: `The ${label} "${title}" was approved by ${evaluatorName}.`,
    bodyLines: [
      `Asset holder name: <strong>${holderName}</strong>`,
      `Asset holder email: <strong>${holderEmail}</strong>`,
      ...listingDetailLines(listing, assetType),
      `Approved by: <strong>${evaluatorName}</strong>`,
      `Approved at: <strong>${when}</strong>`,
    ],
    ctaLabel: 'Open Site',
    ctaPath: '/',
    previewImageUrl: previewImageUrl || undefined,
  })
}

function premiumServiceLabel(serviceType) {
  const t = String(serviceType || '').toLowerCase()
  if (t.includes('walk') || t.includes('3d')) return '3D walkthrough'
  if (t.includes('tech') || t.includes('report')) return 'technical report'
  return 'premium service'
}

/**
 * Asset holder booked 3D walkthrough or technical report — notify FV.
 */
export async function notifyFvPremiumServiceRequested({
  serviceType,
  request,
  listing,
}) {
  if (!request && !listing) {
    return { success: false, message: 'Missing request' }
  }

  const serviceLabel = premiumServiceLabel(serviceType)
  const holderName =
    displayName(request?.name) ||
    listing?.evaluationContactName ||
    'Asset Holder'
  const holderEmail =
    request?.email || listing?.evaluationContactEmail || 'N/A'
  const assetType = request?.assetType || listing?.assetType
  const label = assetLabel(assetType)
  const title =
    listing?.title || request?.productTitle || request?.title || 'listing'

  const lines = [
    `Service: <strong>${serviceLabel}</strong>`,
    `Asset holder name: <strong>${holderName}</strong>`,
    `Asset holder email: <strong>${holderEmail}</strong>`,
    `Asset type: <strong>${label}</strong>`,
    `Title: <strong>${title}</strong>`,
  ]

  if (request?.phone) {
    lines.push(`Phone: <strong>${request.phone}</strong>`)
  }
  if (request?.dateTime) {
    lines.push(`Booked slot: <strong>${formatDateTime(request.dateTime)}</strong>`)
  }
  if (request?.price != null && request.price !== '') {
    lines.push(`Price: <strong>${request.price}</strong>`)
  }
  lines.push(
    `Status: <strong>Requested — pending delivery / not completed yet</strong>`,
  )

  return sendFvPortalEmail({
    subject: `New ${serviceLabel} request — Funds Verifier`,
    headline: `An asset holder requested a ${serviceLabel}.`,
    bodyLines: lines,
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })
}

/**
 * 3D walkthrough or technical report completed — notify FV.
 */
export async function notifyFvPremiumServiceCompleted({
  serviceType,
  listing,
  assetHolder,
  assetType,
  provider,
  completedAt = new Date(),
}) {
  const serviceLabel = premiumServiceLabel(serviceType)
  const holderName = displayName(assetHolder) || 'Asset Holder'
  const holderEmail = assetHolder?.email || 'N/A'
  const providerName = displayName(provider) || 'Provider'
  const label = assetLabel(assetType || listing?.assetType)
  const title = listing?.title || 'listing'
  const when = formatDateTime(completedAt)

  return sendFvPortalEmail({
    subject: `${serviceLabel} completed — ${label} — Funds Verifier`,
    headline: `The ${serviceLabel} for "${title}" was completed by ${providerName}.`,
    bodyLines: [
      `Service: <strong>${serviceLabel}</strong>`,
      `Asset holder name: <strong>${holderName}</strong>`,
      `Asset holder email: <strong>${holderEmail}</strong>`,
      ...listingDetailLines(listing || {}, assetType),
      `Completed by: <strong>${providerName}</strong>`,
      `Completed at: <strong>${when}</strong>`,
    ],
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })
}

/**
 * Buyer/broker booked a trustee viewing — notify FV.
 */
export async function notifyFvViewingRequested({
  assetHolder,
  buyer,
  listingTitle,
  assetType,
  slotDate,
  slotTime,
  message,
}) {
  const holderName = displayName(assetHolder) || 'Asset Holder'
  const holderEmail = assetHolder?.email || 'N/A'
  const buyerName = displayName(buyer) || 'A buyer'
  const buyerEmail = buyer?.email || 'N/A'
  const label = assetLabel(assetType)
  const title = listingTitle || 'listing'
  const whenParts = [slotDate, slotTime].filter(Boolean)

  const lines = [
    `Service: <strong>Property viewing (Trustee)</strong>`,
    `Requester name: <strong>${buyerName}</strong>`,
    `Requester email: <strong>${buyerEmail}</strong>`,
    `Asset holder name: <strong>${holderName}</strong>`,
    `Asset holder email: <strong>${holderEmail}</strong>`,
    `Asset type: <strong>${label}</strong>`,
    `Title: <strong>${title}</strong>`,
  ]

  if (whenParts.length) {
    lines.push(`Viewing slot: <strong>${whenParts.join(' at ')}</strong>`)
  }
  if (message) {
    lines.push(`Message: <strong>${String(message).slice(0, 300)}</strong>`)
  }
  lines.push(
    'Status: <strong>Viewing requested — pending / not completed yet</strong>',
  )

  return sendFvPortalEmail({
    subject: `New viewing request — ${label} — Funds Verifier`,
    headline: `${buyerName} requested a viewing for "${title}".`,
    bodyLines: lines,
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })
}

/**
 * Viewing / trustee booking completed — notify FV.
 */
export async function notifyFvViewingCompleted({
  assetHolder,
  buyer,
  listingTitle,
  assetType,
  slotDate,
  slotTime,
  completedAt = new Date(),
  completedBy,
}) {
  const holderName = displayName(assetHolder) || 'Asset Holder'
  const holderEmail = assetHolder?.email || 'N/A'
  const buyerName = displayName(buyer) || 'A buyer'
  const buyerEmail = buyer?.email || 'N/A'
  const label = assetLabel(assetType)
  const title = listingTitle || 'listing'
  const when = formatDateTime(completedAt)
  const whenParts = [slotDate, slotTime].filter(Boolean)
  const byName = displayName(completedBy) || 'Trustee'

  const lines = [
    `Service: <strong>Property viewing (Trustee)</strong>`,
    `Requester name: <strong>${buyerName}</strong>`,
    `Requester email: <strong>${buyerEmail}</strong>`,
    `Asset holder name: <strong>${holderName}</strong>`,
    `Asset holder email: <strong>${holderEmail}</strong>`,
    `Asset type: <strong>${label}</strong>`,
    `Title: <strong>${title}</strong>`,
  ]

  if (whenParts.length) {
    lines.push(`Viewing slot: <strong>${whenParts.join(' at ')}</strong>`)
  }
  lines.push(`Completed by: <strong>${byName}</strong>`)
  lines.push(`Completed at: <strong>${when}</strong>`)

  return sendFvPortalEmail({
    subject: `Viewing completed — ${label} — Funds Verifier`,
    headline: `The viewing for "${title}" was completed.`,
    bodyLines: lines,
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })
}
