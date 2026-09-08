import { validateListingQuery as validateQuery } from '../utils/listingQuery.js'

/** Reject NoSQL operator injection and unknown listing query params with 400. */
export const validateListingQuery = (req, res, next) => {
  const result = validateQuery(req.query)
  if (!result.ok) {
    return res.status(400).json({ message: result.message })
  }
  next()
}
