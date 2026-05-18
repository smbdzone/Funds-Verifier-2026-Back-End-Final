import express from "express";
const router = express.Router();

import { sendMail } from "../controller/emailCtrl.js";
import { emailFormLimiter } from "../middlewares/rateLimiter.js";

router.post("/", emailFormLimiter, sendMail);

export default router;
