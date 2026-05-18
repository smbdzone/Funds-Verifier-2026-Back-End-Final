import express from "express";
import {
  addReview,
  getReviewsByProductId,
  getReviewsByProductIdFromBody,
  getReviewCounts,
} from "../controller/reviewCtrl.js";
import { reviewLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

router.post("/add", reviewLimiter, addReview);
router.get("/get", getReviewsByProductId);
router.post("/get-by-id", getReviewsByProductIdFromBody);
router.post("/count", getReviewCounts);

export default router;
