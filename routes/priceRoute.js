import express from 'express'
import {
  createPrice,
  getPrices,
  updatePrice,
  getPriceById,
  deletePrice,
  filterPrice,
} from '../controller/priceCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { userRateLimiter } from '../middlewares/rateLimiter.js'

const router = express.Router()
router.post('/', authMiddleware, createPrice)
router.get('/all/:id', authMiddleware, getPrices)
router.get('/filter-price', authMiddleware, filterPrice)
router.put('/:id', authMiddleware, updatePrice)
router.get('/:id', authMiddleware, getPriceById)
router.delete('/:id', authMiddleware, userRateLimiter, deletePrice)

export default router
