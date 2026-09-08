import {
  authMiddleware,
  isAdmin,
  requireBearerAuth,
} from './authMiddleware.js'

/** Super Admin API chain: Bearer token + JWT auth + role === Admin */
export const adminOnly = [requireBearerAuth, authMiddleware, isAdmin]
