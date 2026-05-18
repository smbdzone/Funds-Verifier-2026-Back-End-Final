import express from "express";
import { PurchaseTrackerForAssetHolder } from "../controller/PurchaseTrackerCtrl.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, PurchaseTrackerForAssetHolder);

export default router;