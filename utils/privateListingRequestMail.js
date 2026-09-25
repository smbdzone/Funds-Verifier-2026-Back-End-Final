import sendEmail from './nodeMailer.js'
import { clean, safeURL } from '../controller/emailCtrl.js'
import { sendFvPortalEmail } from './fvPortalMail.js'
import { absoluteFrontendUrl, getPublicListingPath } from './listingDeepLinks.js'

function escapeText(value) {
  return clean(String(value || '').trim())
}

function formatPrice(listing) {
  const amount = listing?.price ?? listing?.priceFrom
  if (amount == null || amount === '') return ''
  const n = Number(amount)
  if (!Number.isFinite(n)) return String(amount)
  return `AED ${n.toLocaleString()}`
}

function locationLine(listing) {
  return [listing?.neighbourhood, listing?.city, listing?.country]
    .filter(Boolean)
    .join(', ')
}

function buildEmailHtml({ recipientName, headline, bodyLines = [] }) {
  const name = escapeText(recipientName) || 'there'
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
            <tr>
              <td style="padding:28px 24px;">
                <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${name},</p>
                <p style="margin:0 0 16px;color:#111827;font-size:16px;font-weight:600;">${headline}</p>
                ${linesHtml}
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

function listingDetailLines(listing, assetType) {
  const title = escapeText(listing?.title) || 'listing'
  const type = escapeText(assetType || listing?.assetType) || 'asset'
  const lines = [
    `Asset type: <strong>${type}</strong>`,
    `Title: <strong>${title}</strong>`,
  ]
  const location = escapeText(locationLine(listing))
  if (location) lines.push(`Location: <strong>${location}</strong>`)
  const price = escapeText(formatPrice(listing))
  if (price) lines.push(`Price: <strong>${price}</strong>`)
  if (listing?.uuid) lines.push(`Listing ID: <strong>${escapeText(listing.uuid)}</strong>`)
  return lines
}

function buyerDetailLines({ name, email, phone }) {
  return [
    `Buyer name: <strong>${escapeText(name)}</strong>`,
    `Buyer email: <strong>${escapeText(email)}</strong>`,
    `Buyer phone: <strong>${escapeText(phone)}</strong>`,
  ]
}

async function sendHtmlEmail({ to, subject, recipientName, headline, bodyLines, text }) {
  if (!to) return { success: false, message: 'Missing recipient' }
  if (!process.env.SMTP_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return { success: false, message: 'Email is not configured on the server' }
  }

  return sendEmail({
    to,
    subject,
    text,
    html: buildEmailHtml({ recipientName, headline, bodyLines }),
  })
}

export async function sendPrivateListingRequestEmails({
  listing,
  seller,
  buyer,
  assetType,
}) {
  const title = listing?.title || 'listing'
  const type = assetType || listing?.assetType || 'asset'
  const listingUrl = safeURL(absoluteFrontendUrl(getPublicListingPath(listing, type)))

  const listingLines = listingDetailLines(listing, type)
  const buyerLines = buyerDetailLines(buyer)

  const sellerName = seller?.name || 'Asset Holder'
  const sellerEmail = seller?.email

  const results = { seller: null, admin: null, buyer: null }

  if (sellerEmail) {
    results.seller = await sendHtmlEmail({
      to: sellerEmail,
      subject: `A buyer is interested in your private listing — Funds Verifier`,
      recipientName: sellerName,
      headline: `${escapeText(buyer.name)} requested to view your private listing.`,
      bodyLines: [
        `A buyer asked to see your private ${escapeText(type)} <strong>${escapeText(title)}</strong>.`,
        ...buyerLines,
        ...listingLines,
        listingUrl && listingUrl !== '#'
          ? `Listing: <strong>${listingUrl}</strong>`
          : '',
      ],
      text: `Hi ${sellerName},\n\n${buyer.name} (${buyer.email}, ${buyer.phone}) requested to view your private listing "${title}".\n`,
    })
  }

  results.admin = await sendFvPortalEmail({
    subject: `Buyer interested in private listing — ${title}`,
    headline: `A buyer requested to view a private listing.`,
    bodyLines: [
      `Seller: <strong>${escapeText(sellerName)}</strong>`,
      sellerEmail ? `Seller email: <strong>${escapeText(sellerEmail)}</strong>` : '',
      ...buyerLines,
      ...listingLines,
    ],
    ctaLabel: 'Open Site',
    ctaPath: '/',
  })

  if (buyer?.email) {
    results.buyer = await sendHtmlEmail({
      to: buyer.email,
      subject: `We received your request — Funds Verifier`,
      recipientName: buyer.name || 'there',
      headline: `We have received your request.`,
      bodyLines: [
        `Thank you for your interest in the private listing <strong>${escapeText(title)}</strong>.`,
        `We have received your request and will be in touch.`,
        ...listingLines,
      ],
      text: `Hi ${buyer.name || 'there'},\n\nWe have received your request to view "${title}". We will be in touch.\n`,
    })
  }

  return results
}
