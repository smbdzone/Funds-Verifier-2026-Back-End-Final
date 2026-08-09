import express from 'express'
const router = express.Router()
import Advertisement from '../models/advertisement.js'

import {
  create,
  getAll,
  getAllSideBanners,
  getAllLargeBanners,
  getAllFooterBanners,
  getByDateAndTime,
  getById,
  getByUserId,
  updatedClicks,
  updatedImpressions,
  update,
  deleteAdvertisement,
  getUserAdvertisements,
  GetAllAdvertisements,
  GetOneAdvertisements,
} from '../controller/advertisementCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminOnly.js'
import { publicLimiter } from '../middlewares/rateLimiter.js'
import { assertWalletAccess } from '../middlewares/assertWalletAccess.js'
import AdsWallet from '../models/AdsWalletModel.js'

router.post('/create-advertisement', authMiddleware, create)
router.get('/', authMiddleware, getAll)
router.get('/approvals/all', ...adminOnly, GetAllAdvertisements)
router.get('/single/:id', ...adminOnly, GetOneAdvertisements)

router.get('/getById', authMiddleware, getAll)
router.get('/getUserAdvertisement', authMiddleware, getUserAdvertisements)
router.get('/getAllSideBanners', authMiddleware, getAllSideBanners)
// Public: served to logged-out visitors too (anonymous viewers get untargeted
// ads only). Reads an optional Bearer token itself, so no authMiddleware here.
router.get('/getAllLargeBanners', publicLimiter, getAllLargeBanners)
router.get('/getAllFooterBanners', authMiddleware, getAllFooterBanners)
router.get('/byDateAndTime', getByDateAndTime)
router.get('/getAdvertisementById/:id', authMiddleware, getById)
// Get advertisements by user; secured inside controller using bearer token & role
router.get('/user/:userId', authMiddleware, getByUserId)
router.put('/updatedClicks', authMiddleware, updatedClicks)
router.put('/updatedImpressions', authMiddleware, updatedImpressions)
router.put('/:id', authMiddleware, update)
router.delete('/:id', authMiddleware, deleteAdvertisement)

router.get(
  '/user/wallet/:id',
  authMiddleware,
  assertWalletAccess,
  async (req, res) => {
    try {
      const { id } = req.params
      const wallet = await AdsWallet.findOne({ userId: id, isDeleted: false })
      return res.status(200).json({ success: true, wallet: wallet })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: error.message,
      })
    }
  },
)

export default router
