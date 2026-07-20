import { createNotification } from '../controller/notifications.controller.js'
import sendViewingBookedEmail from '../utils/viewingBookedMail.js'

/**
 * In-app notification + email when a buyer books a viewing for an asset.
 */
export async function notifyAssetHolderViewingBooked({
  assetHolderUUID,
  buyerName,
  listingTitle,
  assetType = 'property',
  listingUUID,
  bookingId,
  bookingUUID,
  slotDate,
  slotTime,
}) {
  if (!assetHolderUUID) return

  const buyer = String(buyerName || '').trim() || 'A buyer'
  const title = String(listingTitle || '').trim() || 'listing'
  const assetLabel = String(assetType || 'property').toLowerCase()
  const whenParts = [slotDate, slotTime].filter(Boolean)
  const whenSuffix = whenParts.length
    ? ` (${whenParts.join(' at ')})`
    : ''

  const message = `${buyer} booked a viewing for your ${assetLabel} (${title})${whenSuffix}.`

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID: assetHolderUUID,
        title: 'Viewing Booked',
        message,
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
}
