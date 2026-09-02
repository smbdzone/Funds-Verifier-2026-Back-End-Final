import multer from 'multer'
import path from 'path'
import fs from 'fs-extra'
import { isExecutableExtension } from '../utils/executableFileBlocklist.js'
import { VIDEO_MAX_BYTES } from '../utils/uploadLimits.js'

// Temporary folder for uploads
const tmpDir = './uploads/tmp'
fs.ensureDirSync(tmpDir)

const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, unique + ext)
  },
})

// Whitelist of extensions
const allowedExt = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
]

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()

    if (isExecutableExtension(file.originalname)) {
      return cb(new Error('Security: Executable files are not allowed'), false)
    }

    if (!allowedExt.includes(ext)) {
      return cb(new Error('Invalid file type'))
    }
    cb(null, true)
  },
  limits: { fileSize: VIDEO_MAX_BYTES }, // listing video limit (30MB)
})
export default upload
