import * as fs from 'fs'
import Blog from '../models/blogModel.js'
import asyncHandler from 'express-async-handler'
import { uploadImageToS3 } from '../services/s3UploadService.js'
import {
  generateCloudFrontSignedUrl,
  cloudFrontUrlForKey,
} from '../services/cloudFrontSignedUrlService.js'
import validateMagicBytes from '../services/validateMagicBytes.js'
import { checkExecutableFile } from '../utils/executableFileBlocklist.js'

// Helper function to delete uploaded files (for old local files)
const deleteFile = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

/**
 * Upload blog image to S3
 * Returns S3 key and CloudFront signed URL (10-year expiry) to store in blog document
 */
const uploadFile = asyncHandler(async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // Security validation
    const executableCheck = checkExecutableFile(file)
    if (executableCheck.isBlocked) {
      return res.status(400).json({
        error: `Security violation: ${executableCheck.reason}`,
      })
    }

    // Validate file type using magic bytes
    if (!file.buffer) {
      return res.status(400).json({ error: 'File buffer not available' })
    }

    const isValid = await validateMagicBytes(file.buffer)
    if (!isValid) {
      return res.status(400).json({
        error: `Invalid file type detected: ${file.originalname}`,
      })
    }

    // Only allow images
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        error: 'Only image files are allowed for blog uploads',
      })
    }

    // Use admin/system UUID for blog images
    const blogUserUUID = 'blog-images'

    // Upload to S3 images bucket
    const uploadResult = await uploadImageToS3(file, blogUserUUID)

    // Generate CloudFront signed URL with 10-year expiry (effectively never expires)
    // Always generate signed URL - never fallback to unsigned (like test upload controller)
    let signedUrl = null
    try {
      const expiresInSeconds = 10 * 365 * 24 * 60 * 60 // 10 years = 315,360,000 seconds
      const signedResult = generateCloudFrontSignedUrl(
        uploadResult.key,
        expiresInSeconds,
      )
      signedUrl = signedResult.signedUrl
      console.log(
        `✓ Generated CloudFront signed URL for uploaded blog image: ${uploadResult.key.substring(0, 60)}...`,
      )
    } catch (urlError) {
      // For blog images, we MUST use CloudFront signed URLs - don't fallback to unsigned
      console.error(
        '✗ Error generating CloudFront signed URL:',
        urlError.message,
      )
      throw new Error(
        `Failed to generate signed URL. CloudFront configuration required. Error: ${urlError.message}`,
      )
    }

    // Return S3 key and signed URL (store signed URL in blog document)
    res.status(200).json({
      message: 'File uploaded successfully',
      s3Key: uploadResult.key,
      url: signedUrl, // CloudFront signed URL with 10-year expiry
      bucket: uploadResult.bucket,
      originalName: file.originalname,
      contentType: file.mimetype,
      size: uploadResult.size,
    })
  } catch (error) {
    console.error('Blog image upload error:', error)
    res.status(500).json({ error: error.message || 'File upload failed' })
  }
})

/**
 * Extract S3 key from CloudFront URL or return the key as-is
 */
function extractS3KeyFromUrl(urlOrKey) {
  if (!urlOrKey || typeof urlOrKey !== 'string') {
    return null
  }

  const trimmed = urlOrKey.trim()

  // If it's already a CloudFront URL, extract the S3 key
  if (trimmed.includes('cloudfront.net/')) {
    const parts = trimmed.split('cloudfront.net/')
    if (parts.length > 1) {
      // Remove query parameters if present
      const keyPart = parts[1].split('?')[0]
      return keyPart
    }
  }

  // If it's already a URL but not CloudFront, return null (we can't extract key)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return null
  }

  // It's already an S3 key
  return trimmed
}

/**
 * Normalize a blog image value for DB storage.
 * - CloudFront URL (signed or unsigned) -> store only S3 key/path (no query)
 * - Raw S3 key/path -> store as-is
 * - Other remote URL (e.g., Cloudinary) -> store as-is
 */
function normalizeBlogImageForDb(imageValue) {
  if (!imageValue || typeof imageValue !== 'string') {
    return imageValue
  }

  const trimmed = imageValue.trim()
  if (!trimmed) return trimmed

  // If it's a CloudFront URL (signed or unsigned), store only the key/path.
  if (trimmed.includes('cloudfront.net/')) {
    const extracted = extractS3KeyFromUrl(trimmed)
    return extracted || trimmed
  }

  // Any other full URL (Cloudinary, etc.) stays as-is.
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  // Otherwise treat as raw S3 key/path.
  return trimmed
}

/**
 * Generate CloudFront signed URL with 10-year expiry for blog images
 * Handles existing URLs and new S3 keys
 * Always returns a valid URL - never returns raw S3 keys
 */
function generateBlogImageUrl(imageValue) {
  if (!imageValue || typeof imageValue !== 'string') {
    return null
  }

  const trimmedValue = imageValue.trim()
  if (!trimmedValue) {
    return null
  }

  // If it's already a full URL (Cloudinary, etc.), usually return as-is.
  // But for CloudFront URLs (signed or unsigned), re-sign on read so the frontend always gets a fresh URL.
  if (
    trimmedValue.startsWith('http://') ||
    trimmedValue.startsWith('https://')
  ) {
    if (trimmedValue.includes('cloudfront.net')) {
      const extractedKey = extractS3KeyFromUrl(trimmedValue)
      if (!extractedKey) {
        return trimmedValue
      }
      try {
        // Keep the signed URL short by using canned policy signing (service uses Expires/Signature/Key-Pair-Id).
        const expiresInSeconds = 60 * 60 // 1 hour
        const signedResult = generateCloudFrontSignedUrl(
          extractedKey,
          expiresInSeconds,
        )
        return signedResult.signedUrl
      } catch (error) {
        console.error(
          '✗ Error re-signing CloudFront URL for blog image:',
          error.message,
        )
        try {
          return cloudFrontUrlForKey(extractedKey)
        } catch {
          return trimmedValue
        }
      }
    }
    // If it's a Cloudinary URL, return as-is
    if (trimmedValue.includes('cloudinary.com')) {
      return trimmedValue
    }
    // For any other URL, return as-is (could be S3 direct URL or other)
    return trimmedValue
  }

  // If it's an S3 key (doesn't start with http), generate CloudFront signed URL
  try {
    const expiresInSeconds = 60 * 60 // 1 hour
    const signedResult = generateCloudFrontSignedUrl(
      trimmedValue,
      expiresInSeconds,
    )
    console.log(
      `✓ Generated CloudFront signed URL for blog image S3 key: ${trimmedValue.substring(0, 60)}...`,
    )
    return signedResult.signedUrl
  } catch (error) {
    console.error(
      '✗ Error generating CloudFront signed URL for blog image:',
      error.message,
    )
    console.error('  S3 key:', trimmedValue.substring(0, 100))

    // Fallback: Try to return CloudFront unsigned URL (might not work if signing is required, but better than S3 key)
    try {
      const cloudFrontUrl = cloudFrontUrlForKey(trimmedValue)
      console.warn(
        `⚠ Using CloudFront unsigned URL as fallback for: ${trimmedValue.substring(0, 60)}...`,
      )
      console.warn(`  Fallback URL: ${cloudFrontUrl.substring(0, 80)}...`)
      return cloudFrontUrl
    } catch (fallbackError) {
      console.error(
        '✗ Failed to generate CloudFront URL (signed or unsigned):',
        fallbackError.message,
      )
      // Last resort: return null (frontend should handle missing images gracefully)
      return null
    }
  }
}

/**
 * Process blog data to add signed URLs for images
 * Handles existing URLs and new S3 keys
 */
function processBlogImages(blog) {
  if (!blog) return blog

  const processed = blog.toObject ? blog.toObject() : { ...blog }

  // Process banner image (handles both old URLs and new S3 keys)
  if (
    processed.banner &&
    typeof processed.banner === 'string' &&
    processed.banner.trim()
  ) {
    const bannerUrl = generateBlogImageUrl(processed.banner.trim())
    if (bannerUrl) {
      processed.banner = bannerUrl
    } else {
      console.warn(
        `Failed to generate URL for banner image: ${processed.banner.substring(0, 50)}...`,
      )
    }
  }

  // Process SEO image (handles both old URLs and new S3 keys)
  if (
    processed.SEO?.image &&
    typeof processed.SEO.image === 'string' &&
    processed.SEO.image.trim()
  ) {
    const seoImageUrl = generateBlogImageUrl(processed.SEO.image.trim())
    if (seoImageUrl) {
      processed.SEO = {
        ...processed.SEO,
        image: seoImageUrl,
      }
    } else {
      console.warn(
        `Failed to generate URL for SEO image: ${processed.SEO.image.substring(0, 50)}...`,
      )
    }
  }

  return processed
}

function isSuperAdmin(req) {
  return String(req.user?.role || '').trim() === 'Admin'
}

/** Public reads only Active blogs; Super Admin may pass includeInactive=true with auth. */
function shouldIncludeInactive(req) {
  return (
    isSuperAdmin(req) &&
    (req.query.includeInactive === 'true' || req.query.includeInactive === '1')
  )
}

/** Hide blogs explicitly marked inactive; legacy rows without status stay visible. */
function applyPublicBlogVisibilityFilter(queryCondition) {
  queryCondition.status = { $not: /^inactive$/i }
}

function setPublicBlogCacheHeaders(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
}

const BLOG_LIST_SORT = { isFeatured: -1, featuredAt: -1, createdAt: -1 }

const addInsightHub = async (req, res) => {
  const {
    title,
    banner,
    category,
    imagealttext,
    date,
    slug,
    services,
    SEO,
    schemas,
    status = 'Active',
    isFeatured = false,
  } = req.body

  try {
    const insightHubExists = await Blog.findOne({ title, isDeleted: false })
    if (insightHubExists) {
      return res.status(400).json({ message: 'InsightHub already exists' })
    }

    // Normalize `category` to always be an array
    const normalizedCategory = Array.isArray(category) ? category : [category] // Convert string to array if needed

    // Store only keys/paths (never signed URLs) for CloudFront assets.
    const bannerStoredValue = normalizeBlogImageForDb(banner)
    const seoImageStoredValue = normalizeBlogImageForDb(SEO?.image)

    const featured = Boolean(isFeatured)

    const newInsightHub = new Blog({
      title,
      banner: bannerStoredValue,
      category: normalizedCategory,
      imagealttext,
      date,
      slug,
      services,
      SEO: {
        title: SEO?.title,
        description: SEO?.description,
        image: seoImageStoredValue,
        imageAlt: SEO?.imageAlt,
      },
      schemas,
      status,
      isFeatured: featured,
      featuredAt: featured ? new Date() : null,
    })

    await newInsightHub.save()
    console.log(`✓ Blog created (stored keys/paths for CloudFront assets)`)
    const processedBlog = processBlogImages(newInsightHub)
    res.status(201).json({
      message: 'InsightHub created successfully',
      data: processedBlog,
    })
  } catch (error) {
    console.error('Error creating blog:', error)
    res.status(400).json({ error: error.message })
  }
}

const deleteInsightHub = async (req, res) => {
  const { insightId } = req.params
  console.log('Permanently deleting InsightHub ID:', insightId)

  try {
    const insightHub = await Blog.findOne({ uuid: insightId })

    if (!insightHub) {
      return res.status(404).json({ message: 'InsightHub not found' })
    }

    // Permanent delete — removes the blog document from the database.
    // Banner/SEO images remain in S3 (same as previous soft-delete behaviour).
    await Blog.deleteOne({ uuid: insightId })

    return res.status(200).json({
      message: 'Blog deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting InsightHub:', error)
    return res
      .status(500)
      .json({ message: 'Server error', error: error.message })
  }
}

const updateInsightHub = async (req, res) => {
  const {
    title,
    slug,
    imagealttext,
    banner,
    services,
    SEO,
    schemas,
    status,
    category,
    isDeleted,
    isFeatured,
  } = req.body

  try {
    const insightHub = await Blog.findOne({
      uuid: req.params.id,
      isDeleted: false,
    })
    if (insightHub) {
      insightHub.title = title
      if (slug) {
        insightHub.slug = slug
      }
      insightHub.imagealttext = imagealttext
      insightHub.services = services
      insightHub.category = category
      insightHub.schemas = schemas
      if (typeof status === 'string' && status.trim()) {
        insightHub.status = status.trim()
      }

      if (typeof isFeatured === 'boolean') {
        const wasFeatured = Boolean(insightHub.isFeatured)
        insightHub.isFeatured = isFeatured
        if (isFeatured && !wasFeatured) {
          insightHub.featuredAt = new Date()
        } else if (!isFeatured) {
          insightHub.featuredAt = null
        }
      }

      // Store only key/path for banner if it's updated
      if (banner !== undefined && banner !== null) {
        if (typeof banner === 'string' && banner.trim()) {
          insightHub.banner = normalizeBlogImageForDb(banner)
        } else {
          // Empty or invalid, use as-is
          insightHub.banner = banner
        }
      }

      // Store only key/path for SEO image if it's updated
      if (SEO?.image !== undefined && SEO?.image !== null) {
        if (typeof SEO.image === 'string' && SEO.image.trim()) {
          insightHub.SEO = {
            ...insightHub.SEO,
            title: SEO.title || insightHub.SEO?.title,
            description: SEO.description || insightHub.SEO?.description,
            image: normalizeBlogImageForDb(SEO.image),
            imageAlt: SEO.imageAlt || insightHub.SEO?.imageAlt,
          }
        } else {
          // Empty or invalid, use as-is
          insightHub.SEO = {
            ...insightHub.SEO,
            title: SEO.title || insightHub.SEO?.title,
            description: SEO.description || insightHub.SEO?.description,
            image: SEO.image,
            imageAlt: SEO.imageAlt || insightHub.SEO?.imageAlt,
          }
        }
      } else if (SEO) {
        // SEO object provided but image not updated, update other fields
        insightHub.SEO = {
          ...insightHub.SEO,
          title: SEO.title || insightHub.SEO?.title,
          description: SEO.description || insightHub.SEO?.description,
          imageAlt: SEO.imageAlt || insightHub.SEO?.imageAlt,
        }
      }

      // Only mutate soft-delete flags when explicitly provided.
      // (The admin edit UI doesn't send `isDeleted` because `getById` strips it.)
      if (typeof isDeleted === 'boolean') {
        insightHub.isDeleted = isDeleted
        insightHub.deletedAt = isDeleted ? new Date() : null
      }
      await insightHub.save()
      console.log(`✓ Blog updated (stored keys/paths for CloudFront assets)`)
      const processedBlog = processBlogImages(insightHub)
      res.json({ message: 'Updated Successfully', data: processedBlog })
    } else {
      res.status(404).json({ message: 'InsightHub not found' })
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Server error' })
  }
}

const getAllInsightHub = async (req, res) => {
  try {
    setPublicBlogCacheHeaders(res)

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const startIndex = (page - 1) * limit

    // Normalize and handle category
    const categoryQuery = (req.query.category || '').trim().toLowerCase()

    let categories
    if (categoryQuery === 'digital marketing') {
      categories = [
        'digital-marketing',
        'seo-optimization',
        'social-media-marketing',
        'ppc-marketing',
      ]
    } else if (categoryQuery === 'software development') {
      categories = [
        'custom-software',
        'mobile-app-development',
        'web-development',
        'ui-ux-designer',
      ]
    }

    const queryCondition = {
      ...(categories ? { category: { $in: categories } } : {}),
      isDeleted: false,
    }

    if (!shouldIncludeInactive(req)) {
      applyPublicBlogVisibilityFilter(queryCondition)
    }

    const totalDocuments = await Blog.countDocuments(queryCondition)

    const insights = await Blog.find(queryCondition)
      .select('-_id -isDeleted -deletedAt')
      .sort(BLOG_LIST_SORT)
      .skip(startIndex)
      .limit(limit)

    // Process images to generate CloudFront signed URLs
    const processedInsights = insights.map(processBlogImages)

    const endIndex = startIndex + insights.length

    res.json({
      data: processedInsights,
      totalPages: Math.ceil(totalDocuments / limit),
      currentPage: page,
      totalDocuments,
      startIndex: startIndex + 1,
      endIndex,
    })
  } catch (error) {
    console.error('Error in getAllInsightHub:', error)
    res.status(500).json({ message: 'Server error', error })
  }
}

const getInsightHubById = async (req, res) => {
  try {
    const insightHub = await Blog.findOne({
      uuid: req.params.id,
      isDeleted: false,
    }).select('-isDeleted -deletedAt')
    if (insightHub) {
      // Process images to generate CloudFront signed URLs
      const processedBlog = processBlogImages(insightHub)
      res.json({ message: 'InsightHub found', data: processedBlog })
    } else {
      res.status(404).json({ message: 'InsightHub not found' })
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message })
  }
}

const getInsightHubByStatus = async (req, res) => {
  try {
    const insights = await Blog.find({
      status: 'Active',
      isDeleted: false,
    }).select('-_id  -isDeleted -deletedAt')
    if (insights.length > 0) {
      // Process images to generate CloudFront signed URLs
      const processedInsights = insights.map(processBlogImages)
      res.json({ message: 'Active InsightHubs found', data: processedInsights })
    } else {
      res.status(404).json({ message: 'No active InsightHubs found' })
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

const getInsightHubByCategory = async (req, res) => {
  try {
    setPublicBlogCacheHeaders(res)

    const categories = req.params.category.split(',')

    const queryCondition = {
      category: { $in: categories },
      isDeleted: false,
    }

    if (!shouldIncludeInactive(req)) {
      applyPublicBlogVisibilityFilter(queryCondition)
    }

    const insights = await Blog.find(queryCondition)
      .select('-_id  -isDeleted -deletedAt')
      .sort(BLOG_LIST_SORT)

    if (insights.length > 0) {
      // Process images to generate CloudFront signed URLs
      const processedInsights = insights.map(processBlogImages)
      res.json({
        message: `InsightHubs found for categories: ${categories.join(', ')}`,
        data: processedInsights,
      })
    } else {
      res.status(404).json({
        message: `No InsightHubs found for categories: ${categories.join(
          ', ',
        )}`,
      })
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

const getInsightHubBySlug = async (req, res) => {
  try {
    setPublicBlogCacheHeaders(res)

    const { slug } = req.params

    const slugQuery = {
      slug,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
    }

    if (!shouldIncludeInactive(req)) {
      applyPublicBlogVisibilityFilter(slugQuery)
    }

    const insightHub = await Blog.findOne(slugQuery)

    if (!insightHub) {
      return res
        .status(404)
        .json({ message: 'InsightHub not found or has been deleted' })
    }

    // Process images to generate CloudFront signed URLs
    const processedBlog = processBlogImages(insightHub)
    res.json({ message: 'InsightHub found', data: processedBlog })
  } catch (error) {
    res.status(500).json({ message: 'Server error' })
  }
}

export {
  addInsightHub,
  deleteInsightHub,
  updateInsightHub,
  getAllInsightHub,
  getInsightHubById,
  getInsightHubByStatus,
  uploadFile,
  getInsightHubByCategory,
  getInsightHubBySlug,
}
