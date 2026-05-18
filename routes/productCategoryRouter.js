import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createCategory,
  updateCategory,
  DeleteCategory,
  getSingleCategory,
  getAllCategory,
} from "../controller/productCategoryCtrl.js";

router.get("/:id", getSingleCategory);
router.get("/", getAllCategory);
router.post("/", authMiddleware, isAdmin, createCategory);
router.put("/:id", authMiddleware, isAdmin, updateCategory);
router.delete("/:id", authMiddleware, isAdmin, DeleteCategory);

export default router;
