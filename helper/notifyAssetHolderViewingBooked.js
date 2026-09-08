import { createNotification } from '../controller/notifications.controller.js'
import sendViewingBookedEmail from '../utils/viewingBookedMail.js'
import sendAssetHolderEventEmail from '../utils/assetHolderEventMail.js'
import {
  notifyFvViewingRequested,
  notifyFvViewingCompleted,
} from '../utils/fvPortalMail.js'
import { formatDubaiDateTime } from '../utils/dubaiDateTime.js'

/**
 * In-app notification + email when a buyer books a viewing for an asset.
 * Also emails FV_EMAIL.
 */
export async function notifyAssetHolderViewingBooked({
  assetHolderUUID,
  assetHolder,
  buyerName,
  buyerEmail,
  listingTitle,
  assetType = 'property',
  listingUUID,
  bookingId,
  bookingUUID,
  slotDate,
  slotTime,
  message,
}) {
  if (!assetHolderUUID) return

  const buyer = String(buyerName || '').trim() || 'A buyer'
  const title = String(listingTitle || '').trim() || 'listing'
  const assetLabel = String(assetType || 'property').toLowerCase()
  const whenParts = [slotDate, slotTime].filter(Boolean)
  const whenSuffix = whenParts.length
    ? ` (${whenParts.join(' at ')})`
    : ''

  const notifyMessage = `${buyer} booked a viewing for your ${assetLabel} (${title})${whenSuffix}.`

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID: assetHolderUUID,
        title: 'Viewing Booked',
        message: notifyMessage,
        RelateRoute: 'all-slot',
        RelatedUUID: listingUUID || bookingUUID,
        RelatedId: bookingId,
      },
    })
  } catch (error) {
    console.log({
      viewingBookedNotificationError: error?.message || error,
    })
  }

  try {
    await sendViewingBookedEmail({
      userUUID: assetHolderUUID,
      buyerName: buyer,
      listingTitle: title,
      assetType: assetLabel,
      slotDate,
      slotTime,
    })
  } catch (error) {
    console.log({ viewingBookedEmailError: error?.message || error })
  }

  try {
    await notifyFvViewingRequested({
      assetHolder: assetHolder || { uuid: assetHolderUUID },
      buyer: { name: buyer, email: buyerEmail },
      listingTitle: title,
      assetType: assetLabel,
      slotDate,
      slotTime,
      message,
    })
  } catch (error) {
    console.log({ fvPortalViewingRequestEmailError: error?.message || error })
  }
}

/**
 * Dashboard + emails when trustee viewing / deal is marked completed.
 * Sends to asset holder and FV_EMAIL.
 */
export async function notifyAssetHolderViewingCompleted({
  assetHolderUUID,
  assetHolder,
  buyerName,
  buyerEmail,
  listingTitle,
  assetType = 'property',
  listingUUID,
  bookingId,
  bookingUUID,
  slotDate,
  slotTime,
  completedBy,
}) {
  if (!assetHolderUUID) return

  const completedAt = new Date()
  const completedAtLabel = formatDubaiDateTime(completedAt)
  const buyer = String(buyerName || '').trim() || 'A buyer'
  const title = String(listingTitle || '').trim() || 'listing'
  const assetLabel = String(assetType || 'property').toLowerCase()
  const byName =
    (typeof completedBy === 'string'
      ? completedBy
      : completedBy?.name || completedBy?.displayName || completedBy?.email) ||
    'Trustee'
  const whenParts = [slotDate, slotTime].filter(Boolean)
  const message = `Your viewing for ${assetLabel} (${title}) was completed by ${byName} on ${completedAtLabel}.`

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID: assetHolderUUID,
        title: 'Viewing Completed',
        message,
        RelateRoute: 'all-slot',
        RelatedUUID: listingUUID || bookingUUID,
        RelatedId: bookingId,
      },
    })
  } catch (error) {
    console.log({
      viewingCompletedNotificationError: error?.message || error,
    })
  }

  try {
    await sendAssetHolderEventEmail({
      userUUID: assetHolderUUID,
      subject: `Viewing completed — Funds Verifier`,
      headline: message,
      bodyLines: [
        `Asset type: <strong>${assetLabel}</strong>`,
        `Title: <strong>${title}</strong>`,
        `Requester: <strong>${buyer}</strong>`,
        whenParts.length
          ? `Viewing slot: <strong>${whenParts.join(' at ')}</strong>`
          : null,
        `Completed by: <strong>${byName}</strong>`,
        `Completed at: <strong>${completedAtLabel}</strong>`,
      ].filter(Boolean),
      ctaLabel: 'View Bookings',
      ctaPath: '/seller-profile/all-slot',
    })
  } catch (error) {
    console.log({ viewingCompletedEmailError: error?.message || error })
  }

  try {
    await notifyFvViewingCompleted({
      assetHolder: assetHolder || { uuid: assetHolderUUID },
      buyer: { name: buyer, email: buyerEmail },
      listingTitle: title,
      assetType: assetLabel,
      slotDate,
      slotTime,
      completedAt,
      completedBy: { name: byName },
    })
  } catch (error) {
    console.log({ fvPortalViewingCompletedEmailError: error?.message || error })
  }
}
