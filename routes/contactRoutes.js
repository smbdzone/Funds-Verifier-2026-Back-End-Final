import express from "express";
import {
  createContact,
  getAllContactUs,
  getContactUsById,
  updateContactUs,
  deleteContactUs,
} from "../controller/contactController.js";
import {
  authMiddleware,
  isAdmin,
  requireBearerAuth,
} from "../middlewares/authMiddleware.js";

const superAdminOnly = [requireBearerAuth, authMiddleware, isAdmin];
import { contactFormLimiter } from "../middlewares/rateLimiter.js";
import { validateEmail, validateStringLength } from "../middlewares/inputValidation.js";

const router = express.Router();

// Super Admin only (Bearer + Admin role). Public POST is below.
router.get("/", ...superAdminOnly, getAllContactUs);
router.get("/:id", ...superAdminOnly, getContactUsById);
router.put("/:id", ...superAdminOnly, updateContactUs);
router.delete("/:id", ...superAdminOnly, deleteContactUs);

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
