import express from "express";
import { createContact } from "../controller/contactController.js";
import { contactFormLimiter } from "../middlewares/rateLimiter.js";
import { validateEmail, validateStringLength } from "../middlewares/inputValidation.js";

const router = express.Router();

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
