import fs from 'fs-extra'
import validateMagicBytes from '../services/validateMagicBytes.js'
export const secureUploadMiddleware = async (req, res, next) => {
  const files = req.file ? [req.file] : req.files
  if (!files || files.length === 0) return next()

  try {
    console.log(req.file || req.files)
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const filePath = req.file.path || req.file.buffer
    let isValid = true

    // Magic byte validation only for files with path (disk storage) or buffer
    if (req.file.path) {
      isValid = await validateMagicBytes(req.file.path)
    }

    if (!isValid) {
      if (req.file.path) await fs.unlink(req.file.path)
      return res
        .status(400)
        .json({ message: 'Invalid file type (magic bytes mismatch)' })
    }

    // Optional: scan for malware here if using antivirus
    // const infected = await scanFile(filePath)
    // if (infected) return res.status(400).json({ message: 'Malware detected' })

    const type = req.file.mimetype.startsWith('image')
      ? 'image'
      : req.file.mimetype.startsWith('video')
      ? 'video'
      : 'pdf'

    next()
  } catch (err) {
    console.error('Secure Upload Middleware error:', err)
    return res
      .status(500)
      .json({ message: 'File upload failed', error: err.message })
  }
}
