import express from "express";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createContact,
  DeleteContact,
  getSingleContact,
  getAllContact,
  updateContact,
} from "../controller/contactCtrl.js";

router.get("/:id", getSingleContact);
router.get("/", getAllContact);
router.post("/", createContact);
router.put("/:id", authMiddleware, isAdmin, updateContact);
router.delete("/:id", authMiddleware, isAdmin, DeleteContact);

export default router;
