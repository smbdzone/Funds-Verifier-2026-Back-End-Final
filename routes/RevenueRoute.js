import express from 'express'
import { GetProductsRevenue } from '../controller/RevenueCtrl.js'
import { authMiddleware, isAdmin } from '../middlewares/authMiddleware.js'
const router = express.Router()

router.get('/', authMiddleware, isAdmin, GetProductsRevenue)

export default router
