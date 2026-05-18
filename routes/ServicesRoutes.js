import express from 'express'
import {
  SubscribeServices,
  UpdateUserForSubscribeServices,
} from '../controller/ServicesCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { assetHolderCreate } from '../middlewares/assetHolderCreate.js'

const router = express.Router()

router.post('/subscribe', authMiddleware, assetHolderCreate, SubscribeServices)
router.get('/subscribe', UpdateUserForSubscribeServices)

export default router
