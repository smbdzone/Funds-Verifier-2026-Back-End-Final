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
import { Readable, PassThrough } from 'stream'
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
        })
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
const convertVideos = async (req, res, next) => {
  try {
    if (!req.files) return next()

    req.files = await Promise.all(
      req.files.map((file) => {
        return new Promise((resolve, reject) => {
          const inputStream = new Readable()
          inputStream.push(file.buffer)
          inputStream.push(null)

          const outputStream = new PassThrough()
          const chunks = []

          outputStream.on('data', (chunk) => chunks.push(chunk))
          outputStream.on('end', () => {
            const finalBuffer = Buffer.concat(chunks)
            resolve({
              ...file,
              buffer: finalBuffer,
              mimetype: 'video/mp4',
              size: finalBuffer.length,
            })
          })
          outputStream.on('error', reject)

          ffmpeg(inputStream)
            .outputOptions('-c:v libx264', '-crf 20', '-preset fast')
            .format('mp4')
            .on('error', reject)
            .pipe(outputStream, { end: true })
        })
      })
    )

    next()
  } catch (err) {
    console.error('Video conversion error:', err)
    res
      .status(500)
      .json({ message: 'Video conversion failed', error: err.message })
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
