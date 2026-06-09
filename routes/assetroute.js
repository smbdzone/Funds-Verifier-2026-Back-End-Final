import express from 'express'
const router = express.Router()

import {
  uploadImgs,
  deleteImgs,
  uploadVideoFun,
  thumbnailImg,
  evalCertificate,
  verificationCertificate,
} from '../controller/assetCtrl.js'
import {
  uploadPhoto,
  // productImgResize,
  // convertVideo,
  uploadVideo,
  // thumbnailImgResize,
  uploadPDF,
  convertVideos,
  secureUploadMiddleware,
  generateSignedUrlMiddleware,
  resizeImages,
  getCertificateDownloadLink,
} from '../middlewares/uploadMedia.js'
import {
  deleteEvaluationCertificate,
  streamEvaluationCertificatePdf,
} from '../controller/evaluationCertificateCtrl.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { authorizeUserByUUID } from '../middlewares/authorizeUser.js'
import { fileUploadLimiter } from '../middlewares/rateLimiter.js'
import { VIDEO_MAX_COUNT } from '../utils/uploadLimits.js'

// Decrypted PDF for listing/detail (encrypted-at-rest S3 objects)
router.get(
  '/evaluation-certificate/:certificateUuid/pdf',
  streamEvaluationCertificatePdf,
)

// Upload videos
router.post(
  '/upload-video',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  uploadVideo.array('video', VIDEO_MAX_COUNT),
  convertVideos, // convert video to mp4
  secureUploadMiddleware, // validate & upload
  uploadVideoFun, // controller
)

// Upload images
router.post(
  '/upload-imgs',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  uploadPhoto.array('images', 10),
  resizeImages(580, 580), // resize images
  secureUploadMiddleware, // validate & upload to S3
  generateSignedUrlMiddleware,
  uploadImgs, // your controller
)

router.post(
  '/thumbnail-imgs',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  uploadPhoto.single('images'),
  resizeImages(580, 580), // resize images
  secureUploadMiddleware,
  generateSignedUrlMiddleware,
  thumbnailImg,
)

// Upload PDFs
router.post(
  '/upload-certificate',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  uploadPDF.single('pdf'), // ✅ matches formData key 'pdf'
  secureUploadMiddleware, // validate only (PDF upload happens after encryption in controller)
  evalCertificate, // controller
)

router.post(
  '/verification-certificate',
  authMiddleware,
  fileUploadLimiter,
  authorizeUserByUUID,
  uploadPDF.single('pdf'),
  secureUploadMiddleware,
  verificationCertificate,
)

router.delete(
  '/delete-certificate/:id',
  authMiddleware,
  authorizeUserByUUID,
  deleteEvaluationCertificate,
)

router.delete(
  '/delete-imgs/:id',
  authMiddleware,
  authorizeUserByUUID,
  deleteImgs,
)

// Secure route for dealhunter/assetholder/etc
router.get('/get-certificate-url', authMiddleware, getCertificateDownloadLink)

export default router
