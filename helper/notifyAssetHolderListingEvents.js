import { createNotification } from '../controller/notifications.controller.js'
import sendAssetHolderEventEmail from '../utils/assetHolderEventMail.js'
import { modelForAssetType } from '../utils/listingPremiumSync.js'
import { sanitizeUUID } from '../utils/nosqlSanitizer.js'
import Property from '../models/propertyModel.js'
import User from '../models/userModel.js'
import sendEmail from '../utils/nodeMailer.js'
import { safeURL } from '../controller/emailCtrl.js'
import { notifyFvListingApproved, notifyFvPremiumServiceCompleted } from '../utils/fvPortalMail.js'
import { getAssetHolderListingPath } from '../utils/listingDeepLinks.js'

function assetLabel(assetType) {
  const t = String(assetType || 'asset').toLowerCase()
  if (t.includes('off plan')) return 'off-plan property'
  if (t.includes('property')) return 'property'
  if (t.includes('car')) return 'car'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewelry'
  return t || 'asset'
}

function relateRouteForAsset(assetType) {
  const t = String(assetType || '').toLowerCase()
  if (t.includes('car')) return 'cars'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewellery'
  return 'my-listing'
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

function hasEvaluationCertificate(listing) {
  const cert = listing?.evaluationCertificate
  if (cert == null || cert === '') return false
  if (typeof cert === 'object') return Boolean(cert._id || cert.uuid)
  return true
}

export function listingBecameEvaluatorApproved(previousListing, updatedListing) {
  if (!updatedListing) return false
  if (Number(previousListing?.status) === 1) return false
  if (Number(updatedListing.status) !== 1) return false
  return hasEvaluationCertificate(updatedListing)
}

export async function resolveListingFromPremiumRecord(record) {
  if (!record) return null
  const Model = modelForAssetType(record.assetType)
  if (!Model) return null

  const uuid = sanitizeUUID(record.productUUID)
  if (uuid) {
    const byUuid = await Model.findOne({
      uuid,
      isDeleted: { $ne: true },
    }).select('uuid title userUUID assetType city country neighbourhood price')
    if (byUuid) return byUuid
  }

  if (record.productId) {
    return Model.findOne({
      _id: record.productId,
      isDeleted: { $ne: true },
    }).select('uuid title userUUID assetType city country neighbourhood price')
  }

  return null
}

function listingDetailsLines(listing, assetType) {
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
  return lines
}

async function notifyAssetHolderEvent({
  userUUID,
  title,
  message,
  relateRoute,
  relatedUUID,
  relatedId,
  emailSubject,
  emailHeadline,
  emailBodyLines,
  emailCtaLabel,
  emailCtaPath,
  emailCtaUrl,
}) {
  if (!userUUID) return

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID,
        title,
        message,
        RelateRoute: relateRoute,
        RelatedUUID: relatedUUID,
        RelatedId: relatedId,
      },
    })
  } catch (error) {
    console.log({ assetHolderEventNotificationError: error?.message || error })
  }

  try {
    await sendAssetHolderEventEmail({
      userUUID,
      subject: emailSubject,
      headline: emailHeadline,
      bodyLines: emailBodyLines,
      ctaLabel: emailCtaLabel || 'View My Listings',
      ctaPath: emailCtaPath || '/seller-profile/my-listing',
      ctaUrl: emailCtaUrl,
    })
  } catch (error) {
    console.log({ assetHolderEventEmailError: error?.message || error })
  }
}

function buildSimpleEmailHtml({
  recipientName,
  headline,
  bodyLines = [],
  ctaLabel,
  ctaUrl,
}) {
  const name = recipientName || 'User'
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

async function notifySuperAdminsEvent({
  title,
  message,
  emailSubject,
  emailHeadline,
  emailBodyLines,
  relatedUUID,
  relatedId,
}) {
  const admins = await User.find(
    { role: 'Admin', isDeleted: false },
    { email: 1, name: 1, uuid: 1, _id: 1 },
  )

  if (!admins?.length) return

  // Dashboard notification (Super Admin panel uses /notifications/role/Admin)
  await Promise.all(
    admins.map(async (admin) => {
      try {
        await createNotification({
          data: {
            UserRole: 'Admin',
            userUUID: admin.uuid, // required by Notifications schema
            userId: String(admin._id || ''),
            title,
            message,
            RelateRoute: undefined,
            RelatedUUID: relatedUUID,
            RelatedId: relatedId,
          },
        })
      } catch (e) {
        console.log({ superAdminNotificationError: e?.message || e })
      }
    }),
  )
}

function formatApprovedAt(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Dashboard + email when evaluator approves a listing (status 1 + certificate).
 */
export async function notifyAssetHolderListingApproved({
  listing,
  assetType,
  evaluator,
}) {
  if (!listing?.userUUID) return

  const approvedAt = new Date()
  const approvedAtLabel = formatApprovedAt(approvedAt)
  const evaluatorName = displayName(evaluator) || 'Evaluator'
  const label = assetLabel(assetType || listing.assetType)
  const title = listing.title || 'listing'
  const message = `${evaluatorName} approved your ${label} (${title}) on ${approvedAtLabel}.`

  let assetHolder = null
  try {
    assetHolder = await User.findOne(
      { uuid: listing.userUUID, isDeleted: false },
      { email: 1, name: 1, uuid: 1 },
    )
  } catch (error) {
    console.log({ assetHolderLookupError: error?.message || error })
  }

  await notifyAssetHolderEvent({
    userUUID: listing.userUUID,
    title: 'Asset Approved',
    message,
    relateRoute: relateRouteForAsset(assetType || listing.assetType),
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `Your ${label} was approved — Funds Verifier`,
    emailHeadline: message,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Approved by: <strong>${evaluatorName}</strong>`,
      `Approved at: <strong>${approvedAtLabel}</strong>`,
      'Your listing is now eligible to appear for buyers on Funds Verifier.',
      'Click the button below to open this listing.',
    ],
    emailCtaLabel: 'Open Listing',
    emailCtaPath: getAssetHolderListingPath(
      assetType || listing.assetType,
      listing.uuid,
    ),
  })

  try {
    await notifyFvListingApproved({
      listing,
      assetHolder,
      assetType,
      evaluator,
      approvedAt,
    })
  } catch (error) {
    console.log({ fvPortalApprovalEmailError: error?.message || error })
  }

  // Also notify Super Admins
  await notifySuperAdminsEvent({
    listing,
    title: 'Asset Approved',
    message: `${evaluatorName} approved a ${label} (${title}) on ${approvedAtLabel}.`,
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `Asset approved — ${label} — Funds Verifier`,
    emailHeadline: `An evaluation was approved by ${evaluatorName}.`,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Approved by: <strong>${evaluatorName}</strong>`,
      `Approved at: <strong>${approvedAtLabel}</strong>`,
      'You can review it in Super Admin notifications.',
    ],
  })
}

/**
 * Dashboard + email when surveyor completes / delivers technical report.
 */
export async function notifyAssetHolderTechnicalReportCompleted({
  listing,
  assetType,
  provider,
}) {
  const ownerUUID = listing?.userUUID
  if (!ownerUUID) return

  const completedAt = new Date()
  const completedAtLabel = formatApprovedAt(completedAt)
  const providerName = displayName(provider) || 'Technical report provider'
  const label = assetLabel(assetType || listing?.assetType)
  const title = listing?.title || 'listing'
  const message = `${providerName} completed the technical report for your ${label} (${title}) on ${completedAtLabel}.`

  let assetHolder = null
  try {
    assetHolder = await User.findOne(
      { uuid: ownerUUID, isDeleted: false },
      { email: 1, name: 1, uuid: 1 },
    )
  } catch (error) {
    console.log({ assetHolderLookupError: error?.message || error })
  }

  await notifyAssetHolderEvent({
    userUUID: ownerUUID,
    title: 'Technical Report Completed',
    message,
    relateRoute: 'my-listing',
    relatedUUID: listing?.uuid,
    relatedId: listing?._id,
    emailSubject: `Technical report completed — Funds Verifier`,
    emailHeadline: message,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Completed by: <strong>${providerName}</strong>`,
      `Completed at: <strong>${completedAtLabel}</strong>`,
      'You can review the report from your listing on the dashboard.',
      'Click the button below to open this listing.',
    ],
    emailCtaLabel: 'Open Listing',
    emailCtaPath: getAssetHolderListingPath(
      assetType || listing?.assetType,
      listing?.uuid,
    ),
  })

  try {
    await notifyFvPremiumServiceCompleted({
      serviceType: 'technical_report',
      listing,
      assetHolder,
      assetType,
      provider,
      completedAt,
    })
  } catch (error) {
    console.log({ fvPortalTechnicalCompletedEmailError: error?.message || error })
  }

  await notifySuperAdminsEvent({
    listing,
    title: 'Technical Report Completed',
    message: `${providerName} completed a technical report for ${label} (${title}) on ${completedAtLabel}.`,
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `Technical report completed — ${label} — Funds Verifier`,
    emailHeadline: `Technical report completed by ${providerName}.`,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Completed by: <strong>${providerName}</strong>`,
      `Completed at: <strong>${completedAtLabel}</strong>`,
      'You can review it in Super Admin notifications.',
    ],
  })
}

/**
 * Dashboard + email when 3D walkthrough link is delivered.
 */
export async function notifyAssetHolderWalkthroughCompleted({
  listing,
  assetType,
  provider,
}) {
  const ownerUUID = listing?.userUUID
  if (!ownerUUID) return

  const completedAt = new Date()
  const completedAtLabel = formatApprovedAt(completedAt)
  const providerName = displayName(provider) || '3D walkthrough provider'
  const label = assetLabel(assetType || listing?.assetType)
  const title = listing?.title || 'listing'
  const message = `${providerName} completed the 3D walkthrough for your ${label} (${title}) on ${completedAtLabel}.`

  let assetHolder = null
  try {
    assetHolder = await User.findOne(
      { uuid: ownerUUID, isDeleted: false },
      { email: 1, name: 1, uuid: 1 },
    )
  } catch (error) {
    console.log({ assetHolderLookupError: error?.message || error })
  }

  await notifyAssetHolderEvent({
    userUUID: ownerUUID,
    title: '3D Walkthrough Completed',
    message,
    relateRoute: 'my-listing',
    relatedUUID: listing?.uuid,
    relatedId: listing?._id,
    emailSubject: `3D walkthrough completed — Funds Verifier`,
    emailHeadline: message,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Completed by: <strong>${providerName}</strong>`,
      `Completed at: <strong>${completedAtLabel}</strong>`,
      'You can open the walkthrough from your listing on the dashboard.',
      'Click the button below to open this listing.',
    ],
    emailCtaLabel: 'Open Listing',
    emailCtaPath: getAssetHolderListingPath(
      assetType || listing?.assetType,
      listing?.uuid,
    ),
  })

  try {
    await notifyFvPremiumServiceCompleted({
      serviceType: '3d_walkthrough',
      listing,
      assetHolder,
      assetType,
      provider,
      completedAt,
    })
  } catch (error) {
    console.log({ fvPortalWalkthroughCompletedEmailError: error?.message || error })
  }

  await notifySuperAdminsEvent({
    listing,
    title: '3D Walkthrough Completed',
    message: `${providerName} completed a 3D walkthrough for ${label} (${title}) on ${completedAtLabel}.`,
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `3D walkthrough completed — ${label} — Funds Verifier`,
    emailHeadline: `3D walkthrough delivered by ${providerName}.`,
    emailBodyLines: [
      ...listingDetailsLines(listing, assetType),
      `Completed by: <strong>${providerName}</strong>`,
      `Completed at: <strong>${completedAtLabel}</strong>`,
      'You can review it in Super Admin notifications.',
    ],
  })
}

/**
 * Dashboard + email when Super Admin approves an off-plan listing.
 * Also emails FV_EMAIL.
 */
export async function notifyAssetHolderOffPlanApproved({ listing }) {
  if (!listing?.userUUID) return

  const approvedAt = new Date()
  const approvedAtLabel = formatApprovedAt(approvedAt)
  const title = listing.title || 'listing'
  const message = `Your off-plan listing (${title}) was approved by Super Admin on ${approvedAtLabel} and is now live.`

  let assetHolder = null
  try {
    assetHolder = await User.findOne(
      { uuid: listing.userUUID, isDeleted: false },
      { email: 1, name: 1, uuid: 1 },
    )
  } catch (error) {
    console.log({ assetHolderLookupError: error?.message || error })
  }

  await notifyAssetHolderEvent({
    userUUID: listing.userUUID,
    title: 'Off-Plan Listing Approved',
    message,
    relateRoute: 'property',
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `Your off-plan listing was approved — Funds Verifier`,
    emailHeadline: message,
    emailBodyLines: [
      ...listingDetailsLines(listing, 'off plan'),
      'Approved by: <strong>Super Admin</strong>',
      `Approved at: <strong>${approvedAtLabel}</strong>`,
      'Your off-plan listing is now live on Funds Verifier.',
      'Click the button below to open this listing.',
    ],
    emailCtaLabel: 'Open Listing',
    emailCtaPath: getAssetHolderListingPath(
      listing.assetType || 'off plan',
      listing.uuid,
    ),
  })

  try {
    await notifyFvListingApproved({
      listing,
      assetHolder,
      assetType: listing.assetType || 'off plan',
      evaluator: { name: 'Super Admin' },
      approvedAt,
    })
  } catch (error) {
    console.log({ fvPortalOffPlanApprovalEmailError: error?.message || error })
  }
}

/**
 * Dashboard + email when Super Admin requests an optional off-plan approval fee.
 */
export async function notifyAssetHolderOffPlanFeeRequested({
  listing,
  amount,
  paymentUrl,
}) {
  if (!listing?.userUUID) return

  const title = listing.title || 'listing'
  const feeLabel =
    amount != null && Number.isFinite(Number(amount))
      ? `${Number(amount).toLocaleString()} AED`
      : 'the requested amount'
  const message = `Please pay the optional off-plan approval fee (${feeLabel}) for your listing (${title}).`

  await notifyAssetHolderEvent({
    userUUID: listing.userUUID,
    title: 'Off-Plan Approval Fee',
    message,
    relateRoute: 'invoices',
    relatedUUID: listing.uuid,
    relatedId: listing._id,
    emailSubject: `Pay off-plan approval fee — Funds Verifier`,
    emailHeadline: message,
    emailBodyLines: [
      ...listingDetailsLines(listing, 'off plan'),
      `Amount due: <strong>${feeLabel}</strong>`,
      'This fee is optional and requested by Super Admin for off-plan approval review.',
      'After payment, the fee will appear under Invoices on your dashboard.',
    ],
    emailCtaLabel: paymentUrl ? 'Pay Approval Fee' : 'Open Invoices',
    emailCtaPath: '/seller-profile/invoices',
    emailCtaUrl: paymentUrl || undefined,
  })
}

/**
 * Mark off-plan approval fee paid from a Stripe Checkout session metadata.
 * Returns the updated listing or null.
 */
export async function markOffPlanApprovalFeePaidFromSession(session) {
  const paymentType = session?.metadata?.paymentType
  if (paymentType !== 'off_plan_approval_fee') return null
  if (session?.payment_status !== 'paid') return null

  const listingUuid = session?.metadata?.listingUuid
  const listingId = session?.metadata?.listingId

  let listing = null
  if (listingUuid) {
    listing = await Property.findOne({
      uuid: listingUuid,
      isDeleted: { $ne: true },
    })
  }
  if (!listing && listingId) {
    listing = await Property.findOne({
      _id: listingId,
      isDeleted: { $ne: true },
    })
  }

  if (!listing) return null

  listing.offPlanApprovalFeeStatus = 'paid'
  listing.offPlanApprovalFeePaidAt = new Date()
  if (session?.id) listing.offPlanApprovalFeeSessionId = session.id
  await listing.save()
  return listing
}
