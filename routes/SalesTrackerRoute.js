import express from "express";
import { GetSalesTrackerForAssetHolder } from "../controller/SalesTrackerCtrl.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware, GetSalesTrackerForAssetHolder);

export default router;