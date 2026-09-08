import { optionalAuthMiddleware } from './authMiddleware.js'
import { publicTokenMiddleware } from './publicTokenMiddleware.js'
import { requireAuthOrPublicToken } from './requireAuthOrPublicToken.js'
import { validateListingQuery } from './validateListingQuery.js'

/** JWT login OR valid x-public-token required before listing read handlers run. */
export const listingReadAccess = [
  optionalAuthMiddleware,
  publicTokenMiddleware,
  requireAuthOrPublicToken,
  validateListingQuery,
]
