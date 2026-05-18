import express from 'express'
const router = express.Router()

import {
  createUser,
  getSingleUser,
  getAllUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
} from "../controller/dealHunterCtrl.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

// DealHunter profile creation must be authenticated (self-service)
router.post('/', authMiddleware, createUser)

router.get('/:id', getSingleUser)
router.get('/', getAllUser)

// Only authenticated user can update; controller enforces ownership
router.put('/update-user/:id', authMiddleware, updateUser)

// Block/unblock require authentication
router.put('/block-user/:id', authMiddleware, blockUser)
router.put('/unblock-user/:id', authMiddleware, unblockUser)
// router.delete("/delete-user/:id", deleteUser);

export default router
