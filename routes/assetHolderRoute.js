import express from "express";
const router = express.Router();

import {
  createUser,
  getSingleUser,
  getAllUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
} from "../controller/assetHolderCtrl.js";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";

// Admin-only management of AssetHolder records
router.post("/", authMiddleware, isAdmin, createUser);
router.get("/:id", authMiddleware, getSingleUser);
router.get("/", authMiddleware, getAllUser);
router.put("/update-user/:id", authMiddleware, isAdmin, updateUser);
router.put("/block-user/:id", authMiddleware, isAdmin, blockUser);
router.put("/unblock-user/:id", authMiddleware, isAdmin, unblockUser);
router.delete("/delete-user/:id", authMiddleware, isAdmin, deleteUser);

export default router;
