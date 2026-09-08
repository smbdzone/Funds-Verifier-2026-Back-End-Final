import { createNotification } from '../controller/notifications.controller.js'
import { notifyFvListingPosted } from '../utils/fvPortalMail.js'
import { notifyEvaluatorEvaluationRequest } from '../utils/evaluatorEventMail.js'
import sendAssetHolderEventEmail from '../utils/assetHolderEventMail.js'

const EVALUATOR_ROUTE_BY_ASSET = {
  property: 'property',
  car: 'cars',
  cars: 'cars',
  boat: 'boat',
  jewelry: 'jewellery',
  jewellery: 'jewellery',
}

export function resolveEvaluatorRelateRoute(assetType, fallback = 'property') {
  const key = String(assetType || fallback).toLowerCase()
  return EVALUATOR_ROUTE_BY_ASSET[key] || fallback
}

function assetLabel(assetType) {
  const t = String(assetType || 'asset').toLowerCase()
  if (t.includes('off plan')) return 'off-plan property'
  if (t.includes('property')) return 'property'
  if (t.includes('car')) return 'car'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewelry'
  return t || 'listing'
}

function relateRouteForAssetHolder(assetType) {
  const t = String(assetType || '').toLowerCase()
  if (t.includes('car')) return 'cars'
  if (t.includes('boat')) return 'boat'
  if (t.includes('jewel')) return 'jewellery'
  return 'my-listing'
}

/**
 * Thank-you confirmation to asset holder after listing submit.
 */
export async function notifyAssetHolderListingSubmitted({
  listing,
  assetHolder,
  assetType,
}) {
  const userUUID = assetHolder?.uuid || listing?.userUUID
  if (!userUUID || !listing) return

  const label = assetLabel(assetType || listing.assetType)
  const title = listing.title || 'listing'
  const isOffPlan = String(assetType || listing.assetType || '')
    .toLowerCase()
    .includes('off plan')

  const message = `Thanks for listing your ${label} (${title}). Our team will review it and update you within 1 to 3 working days.`

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID,
        userId: assetHolder?._id ? String(assetHolder._id) : undefined,
        title: 'Listing Submitted',
        message,
        RelateRoute: relateRouteForAssetHolder(assetType || listing.assetType),
        RelatedId: listing._id,
        RelatedUUID: listing.uuid,
      },
    })
  } catch (error) {
    console.log({ listingSubmittedNotificationError: error?.message || error })
  }

  try {
    await sendAssetHolderEventEmail({
      userUUID,
      subject: `Thanks for listing your ${label} — Funds Verifier`,
      headline: `Thank you for listing your ${label}.`,
      bodyLines: [
        `We received your listing details for <strong>${title}</strong>.`,
        `Asset type: <strong>${label}</strong>`,
        listing?.price != null && listing.price !== ''
          ? `Price: <strong>${listing.price}</strong>`
          : null,
        isOffPlan
          ? 'Your off-plan listing is pending Super Admin approval.'
          : 'Your listing has been submitted for review.',
        'Our team will review it and update you soon — typically within <strong>1 to 3 working days</strong>.',
        'Thank you for choosing Funds Verifier.',
      ].filter(Boolean),
      ctaLabel: 'View My Listings',
      ctaPath: '/seller-profile/my-listing',
    })
  } catch (error) {
    console.log({ listingSubmittedEmailError: error?.message || error })
  }
}

/** Role-wide evaluator alert (no userUUID — visible to all evaluators). */
export async function notifyEvaluatorsNewListing({
  title = 'Evaluation',
  message,
  assetType,
  relatedId,
  relatedUUID,
  listing,
  assetHolder,
}) {
  if (!message) return

  const notificationData = {
    UserRole: 'Evaluator',
    title,
    message,
    RelateRoute: resolveEvaluatorRelateRoute(assetType),
    RelatedId: relatedId,
    RelatedUUID: relatedUUID,
  }

  // Prefer inbox for the assigned evaluator when known
  if (listing?.evaluatorUUID) {
    notificationData.userUUID = listing.evaluatorUUID
  }

  await createNotification({
    data: notificationData,
  })

  if (listing) {
    try {
      await notifyAssetHolderListingSubmitted({
        listing,
        assetHolder,
        assetType: assetType || listing.assetType,
      })
    } catch (error) {
      console.log({ assetHolderSubmittedNotifyError: error?.message || error })
    }

    try {
      await notifyEvaluatorEvaluationRequest({
        listing,
        assetHolder,
        assetType: assetType || listing.assetType,
      })
    } catch (error) {
      console.log({ evaluatorRequestEmailError: error?.message || error })
    }

    try {
      await notifyFvListingPosted({
        listing,
        assetHolder,
        assetType: assetType || listing.assetType,
      })
    } catch (error) {
      console.log({ fvPortalPostedEmailError: error?.message || error })
    }
  }
}

export async function notifyAssetHolder({
  userUUID,
  userId,
  title,
  message,
  relateRoute,
  relatedId,
  relatedUUID,
}) {
  if (!userUUID || !message) return

  await createNotification({
    data: {
      userUUID,
      userId,
      UserRole: 'AssetHolder',
      title,
      message,
      RelateRoute: relateRoute,
      RelatedId: relatedId,
      RelatedUUID: relatedUUID,
    },
  })
}
