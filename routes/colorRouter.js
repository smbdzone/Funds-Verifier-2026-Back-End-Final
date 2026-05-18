import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createColor,
  updateColor,
  DeleteColor,
  getSingleColor,
  getAllColor,
} from "../controller/colorCtrl.js";

router.get("/:id", getSingleColor);
router.get("/", getAllColor);
router.post("/", authMiddleware, isAdmin, createColor);
router.put("/:id", authMiddleware, isAdmin, updateColor);
router.delete("/:id", authMiddleware, isAdmin, DeleteColor);

export default router;
