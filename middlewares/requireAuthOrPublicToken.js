/**
 * Blocks listing read requests with no JWT (req.user) and no valid x-public-token (req.publicUser).
 * Must run after optionalAuthMiddleware and publicTokenMiddleware.
 */
export function requireAuthOrPublicToken(req, res, next) {
  if (req.user || req.publicUser) {
    return next()
  }

  return res.status(401).json({
    success: false,
    message: 'Access denied',
  })
}
