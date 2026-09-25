export const IMAGE_MAX_BYTES = 2 * 1024 * 1024 // 2MB per image
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024 // 30MB per video
export const PDF_MAX_BYTES = 10 * 1024 * 1024 // 10MB per PDF
export const IMAGE_MAX_COUNT = 10
export const VIDEO_MAX_COUNT = 2
// Stay at the image size so chunks pass the same reverse-proxy body limit.
export const VIDEO_CHUNK_MAX_BYTES = IMAGE_MAX_BYTES
export const VIDEO_MAX_CHUNKS = Math.ceil(VIDEO_MAX_BYTES / VIDEO_CHUNK_MAX_BYTES)

export const IMAGE_MAX_MB = IMAGE_MAX_BYTES / (1024 * 1024)
export const VIDEO_MAX_MB = VIDEO_MAX_BYTES / (1024 * 1024)
export const PDF_MAX_MB = PDF_MAX_BYTES / (1024 * 1024)

export const multerErrorMessage = (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    if (err.field === 'video') {
      return `Video file is too large. Maximum allowed size is ${VIDEO_MAX_MB}MB per video.`
    }
    if (err.field === 'images') {
      return `Image file is too large. Maximum allowed size is ${IMAGE_MAX_MB}MB per image.`
    }
    if (err.field === 'pdf') {
      return `PDF file is too large. Maximum allowed size is ${PDF_MAX_MB}MB.`
    }
    return 'File is too large. Please use a smaller file.'
  }

  if (err?.code === 'LIMIT_FILE_COUNT') {
    if (err.field === 'video') {
      return `Too many videos. Maximum allowed is ${VIDEO_MAX_COUNT} videos per upload.`
    }
    return `Too many images. Maximum allowed is ${IMAGE_MAX_COUNT} images per upload.`
  }

  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Unexpected file field. Please check your upload and try again.'
  }

  return err?.message || 'Invalid file upload'
}
