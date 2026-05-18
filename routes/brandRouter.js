import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createBrand,
  updateBrand,
  DeleteBrand,
  getSingleBrand,
  getAllBrand,
} from "../controller/brandCtrl.js";

router.get("/:id", getSingleBrand);
router.get("/", getAllBrand);
router.post("/", authMiddleware, isAdmin, createBrand);
router.put("/:id", authMiddleware, isAdmin, updateBrand);
router.delete("/:id", authMiddleware, isAdmin, DeleteBrand);

export default router;
