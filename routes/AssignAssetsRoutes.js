import express from "express";
import { adminOnly } from "../middlewares/adminOnly.js";
import { AssignAssetToEvaluator } from "../controller/AssignAssetsCtrl.js";
const router = express.Router();

router.post("/", ...adminOnly, AssignAssetToEvaluator);

export default router;
