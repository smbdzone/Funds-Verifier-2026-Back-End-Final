import asyncHandler from 'express-async-handler'
import { uploadToS3 } from '../services/s3UploadService.js'
import {
  generateCloudFrontSignedUrl,
  cloudFrontUrlForKey,
  generateAssetUrl,
} from '../services/cloudFrontSignedUrlService.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as getS3PresignedUrl } from '@aws-sdk/s3-request-presigner'
import { getBuckets, getS3Client } from '../utils/awsConfig.js'
import validateMagicBytes from '../services/validateMagicBytes.js'
import { checkExecutableFile } from '../utils/executableFileBlocklist.js'

/**
 * Test endpoint for uploading assets (images, videos, PDFs)
 * Supports both signed and public URLs based on query parameter
 */
const testUploadAsset = asyncHandler(async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      })
    }

    // Security validation
    const executableCheck = checkExecutableFile(file)
    if (executableCheck.isBlocked) {
      return res.status(400).json({
        success: false,
        message: `Security violation: ${executableCheck.reason}`,
      })
    }

    // Validate file type using magic bytes
    if (!file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'File buffer not available',
      })
    }

    const isValid = await validateMagicBytes(file.buffer)
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type detected: ${file.originalname}`,
      })
    }

    // Get public/private preference from query params or body
    // Default to private (signed) for security
    const isPublic =
      req.query.public === 'true' ||
      req.query.public === true ||
      req.body?.public === true ||
      req.body?.public === 'true' ||
      req.query.isPublic === 'true' ||
      req.body?.isPublic === true

    const isSigned = !isPublic // Private = signed, Public = unsigned

    // Use a test user UUID for test uploads
    const testUserUUID = 'test-upload-user'

    // Determine file type and upload to appropriate S3 bucket with access type
    let uploadResult
    const buckets = getBuckets()

    if (file.mimetype.startsWith('image/')) {
      // Upload image with public/private flag
      uploadResult = await uploadToS3({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype,
        bucket: buckets.images,
        userUUID: testUserUUID,
        category: 'images',
        isPublic, // Pass public/private flag
        metadata: {
          'test-upload': 'true',
          'access-type': isPublic ? 'public' : 'private',
        },
      })
    } else if (file.mimetype.startsWith('video/')) {
      // Upload video with public/private flag
      uploadResult = await uploadToS3({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype,
        bucket: buckets.videos,
        userUUID: testUserUUID,
        category: 'videos',
        isPublic, // Pass public/private flag
        metadata: {
          'test-upload': 'true',
          'access-type': isPublic ? 'public' : 'private',
        },
      })
    } else if (file.mimetype === 'application/pdf') {
      // Upload PDF to documents bucket (usually private)
      uploadResult = await uploadToS3({
        buffer: file.buffer,
        originalName: file.originalname,
        contentType: file.mimetype,
        bucket: buckets.documents,
        userUUID: testUserUUID,
        category: 'documents',
        isPublic, // Pass public/private flag
        metadata: {
          'test-upload': 'true',
          'access-type': isPublic ? 'public' : 'private',
        },
      })
    } else {
      return res.status(400).json({
        success: false,
        message: `Unsupported file type: ${file.mimetype}`,
      })
    }

    // Generate URLs based on access type using the new generateAssetUrl function
    let urlInfo = null
    let s3PresignedUrl = null

    try {
      if (isPublic) {
        // Public URL: Generate unsigned CloudFront URL (or long-expiry signed if CloudFront requires signing)
        // For truly public access, CloudFront distribution should allow unsigned URLs
        // If CloudFront requires signing, we use 10-year expiry as "public"
        urlInfo = generateAssetUrl(uploadResult.key, true)
      } else {
        // Private URL: Generate CloudFront signed URL with 1 hour expiry
        urlInfo = generateAssetUrl(uploadResult.key, false, 3600) // 1 hour
        
        // Also generate S3 presigned URL as fallback (optional)
        try {
          const s3Client = getS3Client()
          const command = new GetObjectCommand({
            Bucket: uploadResult.bucket,
            Key: uploadResult.key,
          })
          s3PresignedUrl = await getS3PresignedUrl(s3Client, command, {
            expiresIn: 3600, // 1 hour
          })
        } catch (s3Error) {
          console.warn('S3 presigned URL generation failed (optional):', s3Error.message)
        }
      }
    } catch (urlError) {
      console.error('Error generating asset URL:', urlError.message)
      throw new Error(`Failed to generate URL: ${urlError.message}`)
    }

    // Return response
    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: urlInfo?.url || urlInfo?.signedUrl, // Primary URL
        s3Key: uploadResult.key,
        bucket: uploadResult.bucket,
        originalName: file.originalname,
        contentType: file.mimetype,
        size: uploadResult.size || file.size,
        uploadedAt: uploadResult.uploadedAt,
        isPublic: urlInfo?.isPublic || false,
        isSigned: !urlInfo?.isPublic || false,
        expiresAt: urlInfo?.expiresAt || null,
        expiresInSeconds: urlInfo?.expiresInSeconds || null,
        urlType: urlInfo?.urlType || 'cloudfront',
        s3PresignedUrl: s3PresignedUrl || null, // Alternative S3 URL (optional, only for private)
        note: urlInfo?.isPublic
          ? 'Public URL: CloudFront URL accessible without tokens (or with very long expiry)'
          : 'Private URL: CloudFront signed URL expires in 1 hour',
      },
    })
  } catch (error) {
    console.error('Test upload error:', error)
    return res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message,
    })
  }
})

export { testUploadAsset }
