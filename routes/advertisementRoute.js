import express from 'express'
const router = express.Router()
import Advertisement from '../models/advertisement.js'

import {
  create,
  getAll,
  getAllFooterBanners,
  getById,
  getByUserId,
  updatedClicks,
  updatedImpressions,
  update,
  markAdvertisementPaid,
  deleteAdvertisement,
  getUserAdvertisements,
  GetAllAdvertisements,
  GetOneAdvertisements,
} from '../controller/advertisementCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminOnly.js'

router.post('/create-advertisement', authMiddleware, create)
router.get('/', authMiddleware, getAll)
router.get('/approvals/all', ...adminOnly, GetAllAdvertisements)
router.get('/single/:id', ...adminOnly, GetOneAdvertisements)

router.get('/getById', authMiddleware, getAll)
router.get('/getUserAdvertisement', authMiddleware, getUserAdvertisements)
router.get('/getAllFooterBanners', authMiddleware, getAllFooterBanners)
router.get('/getAdvertisementById/:id', authMiddleware, getById)
// Get advertisements by user; secured inside controller using bearer token & role
router.get('/user/:userId', authMiddleware, getByUserId)
router.put('/updatedClicks', authMiddleware, updatedClicks)
router.put('/updatedImpressions', authMiddleware, updatedImpressions)
// Server-to-server payment confirmation (Stripe webhook / checkout return).
// Auth is the shared internal secret checked inside the handler — no user
// token — so it is placed before the '/:id' wildcard.
router.put('/payment-confirm/:id', markAdvertisementPaid)
router.put('/:id', authMiddleware, update)
router.delete('/:id', authMiddleware, deleteAdvertisement)

export default router
