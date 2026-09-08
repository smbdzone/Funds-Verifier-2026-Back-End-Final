// import express from "express";
// import { authMiddleware, isAdmin } from "../middlewares/authMiddleware.js";
// const router = express.Router();

// import {
//   createBlog,
//   getSingleBlog,
//   getAllBlog,
//   updateBlog,
//   deleteBlog,
//   likeBlog,
//   dislikeBlog,
//   uploadImgs,
// } from "../controller/blogCtrl.js";
// import { uploadPhoto, blogImgResize } from "../middlewares/uploadImgs.js";

// router.get("/", getAllBlog);
// router.get("/:id", getSingleBlog);
// router.put("/likes", authMiddleware, likeBlog);
// router.put("/dislikes", authMiddleware, dislikeBlog);
// router.post("/", authMiddleware, isAdmin, createBlog);
// router.put("/:id", authMiddleware, isAdmin, updateBlog);
// router.put(
//   "/upload-imgs/:id",
//   authMiddleware,
//   isAdmin,
//   uploadPhoto.array("images", 10),
//   blogImgResize,
//   uploadImgs
// );
// router.delete("/:id", authMiddleware, isAdmin, deleteBlog);

// export default router;
import express from 'express'
import upload from '../middlewares/Multer.js'
import {
  addInsightHub,
  deleteInsightHub,
  updateInsightHub,
  getAllInsightHub,
  getInsightHubById,
  getInsightHubBySlug,
  getInsightHubByStatus,
  uploadFile,
  getInsightHubByCategory,
} from '../controller/blogCtrl.js'
import {
  addBlogComment,
  getBlogComments,
  getAdminBlogComments,
  updateBlogCommentStatus,
  deleteAdminBlogComment,
} from '../controller/blogCommentCtrl.js'
import {
  authMiddleware,
  isAdmin,
  optionalAuthMiddleware,
} from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import {
  fileUploadLimiter,
  listingReadLimiter,
  reviewLimiter,
} from '../middlewares/rateLimiter.js'

const router = express.Router()

// Define the routes
// Upload blog image to S3 - returns S3 key to store in blog document
router.post(
  '/upload',
  fileUploadLimiter,
  upload.single('file'),
  uploadFile
)
router.post(
  '/add',
  authMiddleware,
  isAdmin,
  authorizeUserByUUID,
  addInsightHub
)
router.delete(
  '/delete/:insightId',
  authMiddleware,
  isAdmin,
  authorizeUserByUUID,
  deleteInsightHub
)
router.put(
  '/update/:id',
  authMiddleware,
  isAdmin,
  authorizeUserByUUID,
  updateInsightHub
)
router.get(
  '/getAll',
  listingReadLimiter,
  optionalAuthMiddleware,
  getAllInsightHub,
)
router.get('/getById/:id', getInsightHubById)
router.get('/getBySlug/:slug', optionalAuthMiddleware, getInsightHubBySlug)
router.get('/getByStatus', authMiddleware, isAdmin, getInsightHubByStatus)
router.get(
  '/getByCategory/:category',
  optionalAuthMiddleware,
  getInsightHubByCategory,
)
router.get(
  '/comments/admin/all',
  authMiddleware,
  isAdmin,
  getAdminBlogComments,
)
router.patch(
  '/comments/admin/:commentId/status',
  authMiddleware,
  isAdmin,
  updateBlogCommentStatus,
)
router.delete(
  '/comments/admin/:commentId',
  authMiddleware,
  isAdmin,
  deleteAdminBlogComment,
)
router.get('/comments/:blogUuid', listingReadLimiter, getBlogComments)
router.post('/comments', reviewLimiter, addBlogComment)

export default router
