import { createNotification } from '../controller/notifications.controller.js'

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

/** Role-wide evaluator alert (no userUUID — visible to all evaluators). */
export async function notifyEvaluatorsNewListing({
  title = 'Evaluation',
  message,
  assetType,
  relatedId,
  relatedUUID,
}) {
  if (!message) return

  await createNotification({
    data: {
      UserRole: 'Evaluator',
      title,
      message,
      RelateRoute: resolveEvaluatorRelateRoute(assetType),
      RelatedId: relatedId,
      RelatedUUID: relatedUUID,
    },
  })
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
