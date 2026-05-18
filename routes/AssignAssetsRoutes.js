import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { AssignAssetToEvaluator } from "../controller/AssignAssetsCtrl.js";
const router = express.Router();

router.post("/", authMiddleware, AssignAssetToEvaluator);

export default router;
