import express from "express";
import {
  authMiddleware,
  isAdmin,
  requireBearerAuth,
} from "../middlewares/authMiddleware.js";
const router = express.Router();

import {
  createContact,
  DeleteContact,
  getSingleContact,
  getAllContact,
  updateContact,
} from "../controller/contactCtrl.js";

/** Legacy contact model at /api/country — same Super Admin rules as /contact-us */
const superAdminOnly = [requireBearerAuth, authMiddleware, isAdmin];

router.get("/", ...superAdminOnly, getAllContact);
router.get("/:id", ...superAdminOnly, getSingleContact);
router.post("/", ...superAdminOnly, createContact);
router.put("/:id", ...superAdminOnly, updateContact);
router.delete("/:id", ...superAdminOnly, DeleteContact);

export default router;
