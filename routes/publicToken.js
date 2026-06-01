import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { publicTokenMiddleware } from '../middlewares/publicTokenMiddleware.js'
import { requireAuthOrPublicToken } from '../middlewares/requireAuthOrPublicToken.js'
import { optionalAuthMiddleware } from '../middlewares/authMiddleware.js'
import { publicTokenLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()

router.get('/get-public-token', publicTokenLimiter, (req, res) => {
  const token = jwt.sign(
    {
      type: 'public',
      ip: req.ip,
      jti: crypto.randomUUID(), // unique per visitor
    },
    process.env.SECRET_KEY,
    { expiresIn: '5m' }
  )

  res.json({ success: true, token })
})

router.get(
  '/data',
  optionalAuthMiddleware,
  publicTokenMiddleware,
  requireAuthOrPublicToken,
  (req, res) => {
    if (req.user) {
      return res.json({ data: 'AUTHENTICATED USER DATA' })
    }

    return res.json({ data: 'PUBLIC USER DATA' })
  },
)

export default router
