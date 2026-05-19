import express from "express";
import {
  createContact,
  getAllContactUs,
  getContactUsById,
  updateContactUs,
  deleteContactUs,
} from "../controller/contactController.js";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
import { contactFormLimiter } from "../middlewares/rateLimiter.js";
import { validateEmail, validateStringLength } from "../middlewares/inputValidation.js";

const router = express.Router();

// Admin-only: contact submissions contain PII (email, phone, message)
router.get("/", authMiddleware, isAdmin, getAllContactUs);
router.get("/:id", authMiddleware, isAdmin, getContactUsById);
router.put("/:id", authMiddleware, isAdmin, updateContactUs);
router.delete("/:id", authMiddleware, isAdmin, deleteContactUs);

// Public: contact form submission
router.post(
  "/",
  contactFormLimiter,
  validateEmail,
  validateStringLength("fullName", 200),
  validateStringLength("subject", 200),
  validateStringLength("message", 5000),
  createContact
);

export default router;
