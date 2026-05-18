import express from 'express'
import multer from 'multer'
import path from 'path'
import { testUploadAsset } from '../controller/testUploadCtrl.js'
import { fileUploadLimiter } from '../middlewares/rateLimiter.js'
import { isExecutableExtension } from '../utils/executableFileBlocklist.js'

// Use memory storage for test uploads (simpler for handling buffers)
const storage = multer.memoryStorage()

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    
    if (isExecutableExtension(file.originalname)) {
      return cb(new Error('Security: Executable files are not allowed'), false)
    }
    
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.mov', '.avi', '.mkv']
    if (!allowedExt.includes(ext)) {
      return cb(new Error('Invalid file type'))
    }
    cb(null, true)
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
})

const router = express.Router()

/**
 * Test endpoint for uploading assets
 * POST /api/test/upload
 * Query params: signed=true/false (default: false)
 * Form data: file (the file to upload)
 */
router.post(
  '/upload',
  fileUploadLimiter,
  upload.single('file'),
  testUploadAsset
)

export default router
