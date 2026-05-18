import express from "express";
import { createTestimonial, deleteTestimonials, getAllTestimonials, getTestimonialsById, updateTestimonials } from "../controller/testiminials.controller.js";
import upload from "../middlewares/Multer.js";
import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Create a new testimonial
router.post("/", upload.single("file"), authMiddleware, isAdmin, createTestimonial);

// Get all testimonials
router.get("/all", getAllTestimonials);

// Get a testimonial by ID
router.get("/:id", getTestimonialsById);

// Update a testimonial by ID
router.put("/:id", upload.single("file"), authMiddleware, isAdmin, updateTestimonials);

// Delete a testimonial by ID
router.delete("/:id", authMiddleware, isAdmin, deleteTestimonials);

export default router;