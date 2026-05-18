import express from "express";
import {
  createAsset,
  getSingleAsset,
  getAllAssets,
  updateAsset,
  deleteAsset,
} from "../controller/create-assets.controller.js";
import upload from "../middlewares/Multer.js";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Route for creating assets with file uploads
router.post(
  "/",
  upload.fields([
    { name: "pictures", maxCount: 5 },
    { name: "video", maxCount: 1 },
    { name: "thumbnailImg", maxCount: 1 },
    { name: "evaluationCertificate", maxCount: 1 },
  ]),
  createAsset
);

router.get("/:id", getSingleAsset); // Fetch a single asset by ID
router.get("/", getAllAssets); // Fetch all assets
router.put(
  "/:id",
  upload.fields([
    { name: "pictures", maxCount: 5 },
    { name: "video", maxCount: 1 },
    { name: "thumbnailImg", maxCount: 1 },
    { name: "evaluationCertificate", maxCount: 1 },
  ]),
  updateAsset
); // Update asset by ID with file uploads
router.delete("/:id",authMiddleware,isAdmin, deleteAsset); // Delete an asset by ID

export default router;
