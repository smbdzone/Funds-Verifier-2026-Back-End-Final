import multer from 'multer'
import path from 'path'
import asyncHandler from 'express-async-handler'
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MB,
  VIDEO_CHUNK_MAX_BYTES,
  VIDEO_MAX_CHUNKS,
} from '../utils/uploadLimits.js'
import {
  saveChunk,
  assembleChunks,
  removeSession,
  sweepStaleChunks,
  assertSafeId,
} from '../utils/videoChunkStore.js'
import { convertVideos, secureUploadMiddleware } from '../middlewares/uploadMedia.js'

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'])

export const uploadVideoChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_CHUNK_MAX_BYTES + 64 * 1024 },
}).single('chunk')

function readChunkMeta(req) {
  const body = req.body || {}
  const headers = req.headers || {}
  return {
    uploadId: String(body.uploadId || headers['x-upload-id'] || '').trim(),
    chunkIndex: Number(body.chunkIndex ?? headers['x-chunk-index']),
    totalChunks: Number(body.totalChunks ?? headers['x-total-chunks']),
    fileName: String(body.fileName || headers['x-file-name'] || 'video.mp4').trim(),
    fileSize: Number(body.fileSize ?? headers['x-file-size']),
    fileType: String(body.fileType || headers['x-file-type'] || 'video/mp4').trim(),
  }
}

function reject(res, status, message) {
  return res.status(status).json({ message, status })
}

function invokeMiddleware(mw, req, res) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve()
    }

    const originalJson = res.json.bind(res)
    const originalSend = res.send.bind(res)
    res.json = (body) => {
      if (!settled && res.statusCode >= 400) {
        const err = new Error(body?.message || body?.error || 'Video upload failed')
        err.statusCode = res.statusCode
        err.body = body
        finish(err)
      }
      return originalJson(body)
    }
    res.send = (body) => {
      if (!settled && res.statusCode >= 400) {
        const err = new Error(typeof body === 'string' ? body : 'Video upload failed')
        err.statusCode = res.statusCode
        finish(err)
      }
      return originalSend(body)
    }

    try {
      mw(req, res, finish)
    } catch (err) {
      finish(err)
    }
  })
}

export const saveVideoChunk = asyncHandler(async (req, res) => {
  sweepStaleChunks()

  const userUUID = req.user?.uuid
  if (!userUUID) return reject(res, 401, 'Unauthorized')
  if (!req.file?.buffer) return reject(res, 400, 'Missing video chunk')

  const meta = readChunkMeta(req)
  let uploadId
  try {
    uploadId = assertSafeId(meta.uploadId, 'upload id')
  } catch (err) {
    return reject(res, 400, err.message)
  }

  if (!Number.isInteger(meta.chunkIndex) || meta.chunkIndex < 0 || meta.chunkIndex >= VIDEO_MAX_CHUNKS) {
    return reject(res, 400, 'Invalid chunk index')
  }
  if (!Number.isInteger(meta.totalChunks) || meta.totalChunks < 1 || meta.totalChunks > VIDEO_MAX_CHUNKS) {
    return reject(res, 400, 'Invalid chunk count')
  }
  if (meta.chunkIndex >= meta.totalChunks) {
    return reject(res, 400, 'Chunk index is out of range')
  }
  if (!Number.isFinite(meta.fileSize) || meta.fileSize <= 0 || meta.fileSize > VIDEO_MAX_BYTES) {
    return reject(
      res,
      400,
      `Video file is too large. Maximum allowed size is ${VIDEO_MAX_MB}MB per video.`,
    )
  }

  await saveChunk({
    userUUID,
    uploadId,
    chunkIndex: meta.chunkIndex,
    buffer: req.file.buffer,
  })

  return res.status(200).json({
    success: true,
    uploadId,
    chunkIndex: meta.chunkIndex,
    totalChunks: meta.totalChunks,
  })
})

export const completeVideoChunkUpload = asyncHandler(async (req, res) => {
  const userUUID = req.user?.uuid
  if (!userUUID) return reject(res, 401, 'Unauthorized')

  const uploadId = String(req.body?.uploadId || '').trim()
  const totalChunks = Number(req.body?.totalChunks)
  const fileName = String(req.body?.fileName || 'video.mp4').trim()
  const contentType = String(req.body?.contentType || req.body?.fileType || 'video/mp4').trim()
  const size = Number(req.body?.size || req.body?.fileSize)
  const assetId = String(req.body?.assetId || '').trim()

  try {
    assertSafeId(uploadId, 'upload id')
  } catch (err) {
    return reject(res, 400, err.message)
  }

  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > VIDEO_MAX_CHUNKS) {
    return reject(res, 400, 'Invalid chunk count')
  }
  if (!Number.isFinite(size) || size <= 0 || size > VIDEO_MAX_BYTES) {
    return reject(
      res,
      400,
      `Video file is too large. Maximum allowed size is ${VIDEO_MAX_MB}MB per video.`,
    )
  }

  const ext = path.extname(fileName).toLowerCase()
  if (ext && !ALLOWED_EXT.has(ext)) {
    return reject(res, 400, 'Unsupported video format')
  }

  let buffer
  try {
    buffer = await assembleChunks({ userUUID, uploadId, totalChunks })
  } catch (err) {
    await removeSession(userUUID, uploadId)
    return reject(res, err.statusCode || 400, err.message)
  }

  if (buffer.length > VIDEO_MAX_BYTES) {
    await removeSession(userUUID, uploadId)
    return reject(
      res,
      400,
      `Video file is too large. Maximum allowed size is ${VIDEO_MAX_MB}MB per video.`,
    )
  }

  req.files = [
    {
      fieldname: 'video',
      originalname: fileName || `video${ext || '.mp4'}`,
      encoding: '7bit',
      mimetype: contentType.startsWith('video/') ? contentType : 'video/mp4',
      buffer,
      size: buffer.length,
    },
  ]
  if (assetId) {
    req.body = { ...(req.body || {}), assetId }
  }

  try {
    await invokeMiddleware(convertVideos, req, res)
    if (res.headersSent) return
    await invokeMiddleware(secureUploadMiddleware, req, res)
    if (res.headersSent) return
    const { uploadVideoFun } = await import('./assetCtrl.js')
    await uploadVideoFun(req, res)
  } catch (err) {
    if (!res.headersSent) {
      return reject(res, err.statusCode || 500, err.message || 'Video upload failed')
    }
  } finally {
    await removeSession(userUUID, uploadId)
  }
})
