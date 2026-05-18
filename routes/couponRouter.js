import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createCoupon,
  getAllCoupon,
  updateCoupon,
  deleteCoupon,
  getSingleCoupon,
} from "../controller/couponCtrl.js";

router.post("/", authMiddleware, isAdmin, createCoupon);
router.get("/", authMiddleware, isAdmin, getAllCoupon);
router.put("/:id", authMiddleware, isAdmin, updateCoupon);
router.get("/:id", authMiddleware, isAdmin, getSingleCoupon);
router.delete("/:id", authMiddleware, isAdmin, deleteCoupon);

export default router;
