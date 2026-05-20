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
import { assertWalletAccess } from '../middlewares/assertWalletAccess.js'
import AdsWallet from '../models/AdsWalletModel.js'

router.post('/create-advertisement', create)
router.get('/', getAll)
router.get('/approvals/all', ...adminOnly, GetAllAdvertisements)
router.get('/single/:id', ...adminOnly, GetOneAdvertisements)

router.get('/getById', getAll)
router.get('/getUserAdvertisement', getUserAdvertisements)
router.get('/getAllSideBanners', getAllSideBanners)
router.get('/getAllLargeBanners', getAllLargeBanners)
router.get('/getAllFooterBanners', getAllFooterBanners)
router.get('/byDateAndTime', getByDateAndTime)
router.get('/getAdvertisementById/:id', getById)
// Get advertisements by user; secured inside controller using bearer token & role
router.get('/user/:userId', authMiddleware, getByUserId)
router.put('/updatedClicks', updatedClicks)
router.put('/updatedImpressions', updatedImpressions)
router.put('/:id', update)
router.delete('/:id', deleteAdvertisement)

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
