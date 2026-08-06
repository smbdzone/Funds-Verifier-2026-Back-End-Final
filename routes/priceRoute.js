import express from 'express'
import {
  createPrice,
  getPrices,
  updatePrice,
  getPriceById,
  deletePrice,
  filterPrice,
} from '../controller/priceCtrl.js'
import {
  authMiddleware,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { userRateLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()
router.post('/', authMiddleware, createPrice)
// TEMP OPEN: list prices without forcing login (close when user asks)
router.get('/all/:id', optionalAuthMiddleware, getPrices)
router.get('/filter-price', authMiddleware, filterPrice)
router.put('/:id', authMiddleware, updatePrice)
router.get('/:id', authMiddleware, getPriceById)
router.delete('/:id', authMiddleware, userRateLimiter, deletePrice)

export default router
