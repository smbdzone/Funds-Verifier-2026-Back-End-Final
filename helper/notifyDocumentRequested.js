import { createNotification } from '../controller/notifications.controller.js'
import sendDocumentRequestedEmail, {
  getRequesterLabel,
} from '../utils/documentRequestMail.js'
import { getRequestDocumentName } from './requestDocumentHelpers.js'

/**
 * In-app notification + email when evaluator/trustee requests documents.
 */
export async function notifyAssetHolderDocumentRequested({
  listing,
  assetType = 'property',
  requesterRole,
  title,
}) {
  if (!listing?.userUUID) return

  const requesterLabel = getRequesterLabel(requesterRole)
  const assetLabel = String(assetType || 'property').toLowerCase()
  const listingTitle = listing?.title || 'listing'
  const documentNames = (listing?.requestDocument || [])
    .map(getRequestDocumentName)
    .map((name) => String(name || '').trim())
    .filter(Boolean)

  const notificationMessage = `${requesterLabel} requested documents for your ${assetLabel} (${listingTitle}). Please upload them in Documents Storage.`

  try {
    await createNotification({
      data: {
        UserRole: 'AssetHolder',
        userUUID: listing.userUUID,
        title: title || `Document Request — ${assetLabel}`,
        message: notificationMessage,
        RelateRoute: 'documents-storage',
        RelatedUUID: listing.uuid,
        RelatedId: listing._id,
      },
    })
  } catch (error) {
    console.log({
      documentRequestNotificationError: error?.message || error,
    })
  }

  try {
    await sendDocumentRequestedEmail({
      userUUID: listing.userUUID,
      assetTitle: listingTitle,
      assetType: assetLabel,
      requesterRole,
      documentNames,
    })
  } catch (error) {
    console.log({ documentRequestEmailError: error?.message || error })
  }
}
