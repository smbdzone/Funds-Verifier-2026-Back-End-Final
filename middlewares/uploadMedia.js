// import multer from "multer";
// import sharp from "sharp";
// import { Readable, PassThrough } from "stream";
// import ffmpeg from "fluent-ffmpeg";

// const storage = multer.memoryStorage();

// const multerFileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("image")) {
//     cb(null, true);
//   } else {
//     cb({ message: "Unsupported file format" }, false);
//   }
// };

// // Multer file filter for videos
// const videoFileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith("video")) {
//     cb(null, true);
//   } else {
//     cb({ message: "Unsupported file format for videos" }, false);
//   }
// };

// // Multer file filter for PDFs
// const pdfFileFilter = (req, file, cb) => {
//   if (file.mimetype === "application/pdf") {
//     cb(null, true);
//   } else {
//     cb(new Error("Unsupported file format for PDFs"), false);
//   }
// };

// const uploadPhoto = multer({
//   storage,
//   fileFilter: multerFileFilter,
//   limits: { fileSize: 5000000 },
// });

// // Multer middleware for video uploads
// const uploadVideo = multer({
//   storage,
//   fileFilter: videoFileFilter,
//   limits: { fileSize: 50000000 }, // Limit video file size to 50MB
// });

// // Multer middleware for PDF uploads
// const uploadPDF = multer({
//   storage,
//   fileFilter: pdfFileFilter,
//   limits: { fileSize: 10000000 },
// })

// const productImgResize = async (req, res, next) => {
//   if (!req.files) return next();
//   try {
//     req.files = await Promise.all(
//       req.files.map(async (file) => {
//         const resizedBuffer = await sharp(file.buffer)
//           .resize(580, 580)
//           .toFormat("jpeg")
//           .jpeg({ quality: 90 })
//           .toBuffer();

//         return {
//           ...file,
//           buffer: resizedBuffer,
//           mimetype: "image/jpeg",
//           size: resizedBuffer.length,
//         };
//       })
//     );
//     next();
//   } catch (error) {
//     return res.status(500).json({ error: error?.message || "Something went wrong!" });
//   }
// };

// const blogImgResize = async (req, res, next) => {
//   if (!req.files) return next();

//   req.files = await Promise.all(
//     req.files.map(async (file) => {
//       const resizedBuffer = await sharp(file.buffer)
//         .resize(580, 580)
//         .toFormat("jpeg")
//         .jpeg({ quality: 90 })
//         .toBuffer();

//       return {
//         ...file,
//         buffer: resizedBuffer,
//         mimetype: "image/jpeg",
//         size: resizedBuffer.length,
//       };
//     })
//   );
//   next();
// };

// const thumbnailImgResize = async (req, res, next) => {
//   if (!req.files) return next();

//   req.files = await Promise.all(
//     req.files.map(async (file) => {
//       const resizedBuffer = await sharp(file.buffer)
//         .resize(580, 580)
//         .toFormat("jpeg")
//         .jpeg({ quality: 90 })
//         .toBuffer();

//       return {
//         ...file,
//         buffer: resizedBuffer,
//         mimetype: "image/jpeg",
//         size: resizedBuffer.length,
//       };
//     })
//   );

//   next();
// };

// // Middleware to convert uploaded videos to a common format
// const convertVideo = async (req, res, next) => {
//   if (!req.files) return next();

//   try {
//     req.files = await Promise.all(
//       req.files.map((file) => {
//         return new Promise((resolve, reject) => {
//           // Create a readable stream from buffer
//           const inputStream = new Readable();
//           inputStream.push(file.buffer);
//           inputStream.push(null);

//           const outputStream = new PassThrough();
//           const chunks = [];

//           outputStream.on("data", (chunk) => {
//             chunks.push(chunk);
//           });

//           outputStream.on("end", () => {
//             const finalBuffer = Buffer.concat(chunks);
//             resolve({
//               ...file,
//               buffer: finalBuffer,
//               mimetype: "video/mp4",
//               size: finalBuffer.length,
//             });
//           });

//           outputStream.on("error", (streamErr) => {
//             console.error("Output stream error:", streamErr);
//             reject(streamErr);
//           });

//           // Handle ffmpeg errors
//           const command = ffmpeg(inputStream)
//             .outputOptions("-c:v libx264")
//             .outputOptions("-crf 20")
//             .outputOptions("-preset fast")
//             .format("mp4")
//             .on("error", (ffmpegErr) => {
//               console.error("FFmpeg error:", ffmpegErr);
//               reject(ffmpegErr);
//             });

//           // Pipe output
//           command.pipe(outputStream, { end: true });
//         });
//       })
//     );

//     next();
//   } catch (err) {
//     console.error("Video conversion failed:", err);
//     next(err); // Pass error to Express error handler
//   }
// };

// export {
//   uploadPhoto,
//   productImgResize,
//   blogImgResize,
//   convertVideo,
//   uploadVideo,
//   thumbnailImgResize,
//   uploadPDF,
// };
import multer from 'multer'
import sharp from 'sharp'
import { spawnSync } from 'child_process'
import path from 'path'
import os from 'os'
import { randomBytes } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import NodeClam from 'clamscan'

import validateMagicBytes from '../services/validateMagicBytes.js'
import initClam from '../utils/calm.js'
import { uploadImageToS3, uploadVideoToS3 } from '../services/s3UploadService.js'
import { cloudFrontUrlForKey } from '../services/cloudFrontSignedUrlService.js'
import EvaluationCertificate from '../models/evaluationCertificateModel.js'
import DealHunterDoc from '../models/dealHunterDocModel.js'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'
import { checkExecutableFile } from '../utils/executableFileBlocklist.js'
import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  PDF_MAX_BYTES,
} from '../utils/uploadLimits.js'

// ------------------- Multer Memory Storage -------------------
const storage = multer.memoryStorage()

const uploadPhoto = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // ✅ SECURITY: Block executable files
    const executableCheck = checkExecutableFile(file)
    if (executableCheck.isBlocked) {
      return cb(new Error(`Security: ${executableCheck.reason}`), false)
    }

    if (file.mimetype.startsWith('image')) cb(null, true)
    else cb(new Error('Unsupported image format'), false)
  },
  limits: { fileSize: IMAGE_MAX_BYTES },
})

const uploadVideo = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // ✅ SECURITY: Block executable files
    const executableCheck = checkExecutableFile(file)
    if (executableCheck.isBlocked) {
      return cb(new Error(`Security: ${executableCheck.reason}`), false)
    }

    if (file.mimetype.startsWith('video')) cb(null, true)
    else cb(new Error('Unsupported video format'), false)
  },
  limits: { fileSize: VIDEO_MAX_BYTES },
})

const uploadPDF = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // ✅ SECURITY: Block executable files
    const executableCheck = checkExecutableFile(file)
    if (executableCheck.isBlocked) {
      return cb(new Error(`Security: ${executableCheck.reason}`), false)
    }

    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Unsupported PDF format'), false)
  },
  limits: { fileSize: PDF_MAX_BYTES },
})

// ------------------- Antivirus Scanner -------------------

// Scan buffer with ClamAV
const scanBuffer = async (buffer) => {
  const clam = await initClam() // ✅ assign the returned instance
  const { isInfected, viruses } = await clam.scanBuffer(buffer)
  if (isInfected) throw new Error(`File is infected: ${viruses}`)
}

// ------------------- Image Resizing -------------------
const resizeImages =
  (width = 580, height = 580) =>
    async (req, res, next) => {
      try {
        if (!req.files) return next()

        req.files = await Promise.all(
          req.files.map(async (file) => {
            // Watermark is burned client-side (centered light "FUNDS VERIFIER" text)
            // before upload so downloads keep branding without double-stamping here.
            const resizedBuffer = await sharp(file.buffer)
              .resize(width, height)
              .toFormat('jpeg')
              .jpeg({ quality: 90 })
              .toBuffer()

            return {
              ...file,
              buffer: resizedBuffer,
              mimetype: 'image/jpeg',
              size: resizedBuffer.length,
            }
          }),
        )

        next()
      } catch (err) {
        console.error('Image resizing error:', err)
        res
          .status(500)
          .json({ message: 'Image resizing failed', error: err.message })
      }
    }

// ------------------- Video Conversion -------------------
let ffmpegAvailable = null

function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  try {
    const result = spawnSync('ffmpeg', ['-version'], { timeout: 8000, encoding: 'utf8' })
    ffmpegAvailable = result.status === 0
  } catch {
    ffmpegAvailable = false
  }
  if (!ffmpegAvailable) {
    console.warn('[upload] FFmpeg is not installed; videos will be stored as uploaded')
  }
  return ffmpegAvailable
}

const SKIP_COMPRESS_UNDER_BYTES = 3 * 1024 * 1024

function isFtypContainer(buffer) {
  if (!buffer || buffer.length < 12) return false
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  return bytes.slice(4, 8).toString('ascii') === 'ftyp'
}

function skipVideoConversion(file) {
  const size = Number(file?.size || file?.buffer?.length || 0)
  if (size <= 0) return true
  // Already small enough for listing cards — skip encode to keep upload fast.
  if (size <= SKIP_COMPRESS_UNDER_BYTES) {
    const name = String(file.originalname || '').toLowerCase()
    const mime = String(file.mimetype || '').toLowerCase()
    if (
      name.endsWith('.mp4') ||
      mime === 'video/mp4' ||
      isFtypContainer(file.buffer)
    ) {
      return true
    }
  }
  return false
}

function reencodeVideoToMp4(file) {
  const token = `${Date.now()}-${randomBytes(4).toString('hex')}`
  const tmpIn = path.join(os.tmpdir(), `fv-video-in-${token}`)
  const tmpOut = path.join(os.tmpdir(), `fv-video-out-${token}.mp4`)

  return (async () => {
    await fs.writeFile(tmpIn, file.buffer)
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(tmpIn)
          .videoFilters("scale='min(854,iw)':-2,fps=24")
          .outputOptions([
            '-c:v libx264',
            '-preset veryfast',
            '-crf 32',
            '-maxrate 700k',
            '-bufsize 1400k',
            '-pix_fmt yuv420p',
            '-map 0:v:0',
            '-map 0:a?',
            '-c:a aac',
            '-b:a 64k',
            '-ac 1',
            '-movflags +faststart',
          ])
          .output(tmpOut)
          .on('end', resolve)
          .on('error', reject)
          .run()
      })
      const outBuffer = await fs.readFile(tmpOut)
      const originalSize = file.buffer?.length || file.size || 0
      if (
        !outBuffer.length ||
        outBuffer.length > VIDEO_MAX_BYTES ||
        (originalSize > 0 && outBuffer.length >= originalSize)
      ) {
        return file
      }
      const base = path.basename(file.originalname || 'video', path.extname(file.originalname || ''))
      return {
        ...file,
        buffer: outBuffer,
        mimetype: 'video/mp4',
        size: outBuffer.length,
        originalname: `${base || 'video'}.mp4`,
      }
    } finally {
      await fs.remove(tmpIn).catch(() => { })
      await fs.remove(tmpOut).catch(() => { })
    }
  })()
}

const convertVideos = async (req, res, next) => {
  try {
    if (!req.files) return next()

    req.files = await Promise.all(
      req.files.map(async (file) => {
        if (skipVideoConversion(file)) {
          return {
            ...file,
            mimetype: file.mimetype?.startsWith('video/') ? file.mimetype : 'video/mp4',
          }
        }
        if (!hasFfmpeg()) {
          return file
        }
        try {
          return await reencodeVideoToMp4(file)
        } catch (err) {
          console.warn(
            '[upload] FFmpeg conversion failed; storing original video',
            err?.message,
          )
          return file
        }
      }),
    )

    next()
  } catch (err) {
    console.error('Video conversion error:', err)
    // Never block listing upload on conversion — store the original file.
    next()
  }
}

// ------------------- Secure Upload Middleware -------------------
const secureUploadMiddleware = async (req, res, next) => {
  try {
    const files = req.file ? [req.file] : req.files
    if (!files || files.length === 0) return next()

    // Auth must run before this middleware so we can derive ownership
    const userUUID = req.user?.uuid || req.query?.userUUID || req.query?.userId
    if (!userUUID) {
      return res.status(401).json({ message: 'Missing authenticated user UUID' })
    }

    for (const file of files) {
      const executableCheck = checkExecutableFile(file)
      if (executableCheck.isBlocked) {
        throw new Error(`Security violation: ${executableCheck.reason}`)
      }

      const isValid = await validateMagicBytes(file.buffer)
      if (!isValid)
        throw new Error(`Invalid file type detected: ${file.originalname}`)
      // await scanBuffer(file.buffer)
    }

    // Upload ONLY images/videos here. PDFs are encrypted in controller then uploaded.
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        if (file.mimetype === 'application/pdf') {
          return null
        }

        if (file.mimetype.startsWith('image')) return uploadImageToS3(file, userUUID)
        if (file.mimetype.startsWith('video')) return uploadVideoToS3(file, userUUID)

        throw new Error(`Unsupported content type: ${file.mimetype}`)
      })
    )

    files.forEach((file, i) => {
      const up = uploadedFiles[i]
      if (!up) return
      file.s3Bucket = up.bucket
      file.s3Key = up.key
      file.s3ETag = up.etag
      file.s3VersionId = up.versionId
      file.uploadedAt = up.uploadedAt
      file.size = up.size
      // Mandatory read path is CloudFront (unsigned for images/videos by default)
      file.cloudFrontUrl = cloudFrontUrlForKey(up.key)
    })

    if (req.file) req.file = files[0]
    else req.files = files

    next()
  } catch (err) {
    console.error('Secure upload middleware error:', err)
    res.status(400).json({ message: 'File upload failed', error: err.message })
  }
}

// For PDFs/documents only: always generate short-lived signed URLs
const generateSignedUrlMiddleware = async (req, res, next) => {
  try {
    const files = req.file ? [req.file] : req.files
    if (!files || files.length === 0) return next()

    // This middleware is used after PDF upload in controller in our flow; kept for future use.
    next()
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Signed URL generation failed', error: err.message })
  }
}

const getCertificateDownloadLink = async (req, res) => {
  try {
    const userUUID = req.user?.uuid
    if (!userUUID) return res.status(401).json({ message: 'Unauthorized' })

    const { s3Key, uuid } = req.query
    if (!s3Key && !uuid) {
      return res.status(400).json({ message: 'Missing s3Key or uuid' })
    }

    let doc
    if (uuid) {
      doc =
        (await EvaluationCertificate.findOne({ uuid })) ||
        (await DealHunterDoc.findOne({ uuid }))
      if (!doc) return res.status(404).json({ message: 'File not found' })
    }

    const effectiveKey = s3Key || doc?.Certificate?.s3Key
    if (!effectiveKey) return res.status(404).json({ message: 'Missing document key' })

    // Ownership enforcement: document must belong to requester (or in future: shared permissions).
    const owner = doc?.userUUID || doc?.Certificate?.userUUID || doc?.createdBy || doc?.userUUID
    if (doc && owner && owner !== userUUID) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const signed = generateCloudFrontSignedUrl(effectiveKey, 3600)
    return res.json({ signedUrl: signed.signedUrl, expiresAt: signed.expiresAt, expiresInSeconds: 3600 })
  } catch (err) {
    console.error('getCertificateDownloadLink error:', err)
    return res.status(500).json({ message: 'Something went wrong' })
  }
}

export {
  uploadPhoto,
  uploadVideo,
  uploadPDF,
  resizeImages,
  convertVideos,
  secureUploadMiddleware,
  generateSignedUrlMiddleware,
  getCertificateDownloadLink,
}
