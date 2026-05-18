import fs from 'fs'
import Testimonials from '../models/testimonialsModel.js'
import { uploadImageToS3, deleteFileFromS3 } from '../services/s3UploadService.js'
import { generateCloudFrontSignedUrl } from '../services/cloudFrontSignedUrlService.js'
import { getBuckets } from '../utils/awsConfig.js'
import validateMagicBytes from '../services/validateMagicBytes.js'
import { checkExecutableFile } from '../utils/executableFileBlocklist.js'
import { createNotification } from './notifications.controller.js'

const TESTIMONIALS_USER_UUID = 'testimonials'
const SIGNED_URL_EXPIRY_SECONDS = 10 * 365 * 24 * 60 * 60 // 10 years

/** Read disk file into buffer and upload to S3; return { url, s3Key }. */
async function uploadTestimonialProfileToS3(reqFile) {
  const path = reqFile.path
  const buffer = fs.readFileSync(path)
  const fileForS3 = {
    buffer,
    originalname: reqFile.originalname,
    mimetype: reqFile.mimetype,
  }
  const executableCheck = checkExecutableFile(fileForS3)
  if (executableCheck.isBlocked) {
    try { fs.unlinkSync(path) } catch (_) {}
    throw new Error(`Security: ${executableCheck.reason}`)
  }
  const isValid = await validateMagicBytes(buffer)
  if (!isValid) {
    try { fs.unlinkSync(path) } catch (_) {}
    throw new Error(`Invalid file type: ${reqFile.originalname}`)
  }
  if (!fileForS3.mimetype.startsWith('image/')) {
    try { fs.unlinkSync(path) } catch (_) {}
    throw new Error('Only image files are allowed for testimonial profile')
  }
  const uploadResult = await uploadImageToS3(fileForS3, TESTIMONIALS_USER_UUID, true)
  try {
    fs.unlinkSync(path)
  } catch (e) {
    console.warn('Could not delete temp file:', path, e?.message)
  }
  const signedResult = generateCloudFrontSignedUrl(uploadResult.key, SIGNED_URL_EXPIRY_SECONDS)
  return { url: signedResult.signedUrl, s3Key: uploadResult.key }
}

// Create a new Testimonial
const createTestimonial = async (req, res) => {
  try {
    const userId = req.query.userId
    const { firstName, rating, description } = req.body
    const file = req.file || null

    if (!firstName)
      return res
        .status(400)
        .json({ error: true, message: 'First name is required!' })
    if (!rating)
      return res
        .status(400)
        .json({ error: true, message: 'Rating is required!' })
    if (!description)
      return res
        .status(400)
        .json({ error: true, message: 'Description is required!' })

    let profileData = {}
    if (file) {
      const profileImage = await uploadTestimonialProfileToS3(file)
      profileData.profile = profileImage?.url
      profileData.profileId = profileImage?.s3Key || null
    }

    // Create testimonial data object with only allowed fields
    const testimonialData = {
      firstName,
      rating,
      description,
      ...profileData,
      // Add any other allowed fields here
    }

    const testimonial = new Testimonials(testimonialData)
    await testimonial.save()

    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Testimonial',
        message: `A new testimonial is added on a site.`,
        RelateRoute: 'testimonial',
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(201).json({ success: true, testimonial })
  } catch (error) {
    console.error('Error creating testimonial:', error)
    return res
      .status(500)
      .json({ error: true, message: 'Internal server error!' })
  }
}

// Get all testimonials
const getAllTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonials.find({ isDeleted: false })
    return res.status(200).json({ success: true, testimonials })
  } catch (error) {
    console.error('Error fetching testimonials:', error)
    return res
      .status(500)
      .json({ error: true, message: 'Internal server error!' })
  }
}

// Get a testimonial by ID
const getTestimonialsById = async (req, res) => {
  try {
    const testimonial = await Testimonials.findById(req.params.id, {
      isDeleted: false,
    })
    if (!testimonial) {
      return res
        .status(404)
        .json({ error: true, message: 'Testimonial not found!' })
    }
    return res.status(200).json({ success: true, testimonial })
  } catch (error) {
    console.error('Error fetching testimonial:', error)
    return res
      .status(500)
      .json({ error: true, message: 'Internal server error!' })
  }
}

// Update a testimonial by ID
const updateTestimonials = async (req, res) => {
  try {
    const userId = req.query.userId

    const { firstName, rating, description } = req.body
    const file = req.file || null

    // Find the existing testimonial first
    const existingTestimonial = await Testimonials.findById(req.params.id, {
      isDeleted: false,
    })
    if (!existingTestimonial) {
      return res
        .status(404)
        .json({ error: true, message: 'Testimonial not found!' })
    }

    // Prepare update data with only allowed fields
    const updateData = {}
    if (firstName) updateData.firstName = firstName
    if (rating) updateData.rating = rating
    if (description) updateData.description = description

    let oldProfileId = null

    // Handle file upload (S3)
    if (file) {
      try {
        const profileImage = await uploadTestimonialProfileToS3(file)

        // Store old profile ID (S3 key or legacy Cloudinary public_id) for cleanup after successful update
        oldProfileId = existingTestimonial.profileId

        updateData.profile = profileImage?.url
        updateData.profileId = profileImage?.s3Key || null
      } catch (uploadError) {
        console.error('Error uploading new file:', uploadError)
        return res
          .status(500)
          .json({ error: true, message: 'Failed to upload new file!' })
      }
    }

    // Update the testimonial
    const testimonial = await Testimonials.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )

    // Only delete old file after successful update (S3 key; legacy Cloudinary public_id is skipped)
    if (oldProfileId && file) {
      try {
        if (oldProfileId.includes('/')) {
          const buckets = getBuckets()
          await deleteFileFromS3(oldProfileId, buckets.images)
        }
      } catch (deleteError) {
        console.error('Error deleting old file from S3:', deleteError)
      }
    }

    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Testimonial',
        message: `A testimonial is updated.`,
        RelateRoute: 'testimonial',
        RelatedId: testimonial?._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({ success: true, testimonial })
  } catch (error) {
    console.error('Error updating testimonial:', error)
    return res
      .status(500)
      .json({ error: true, message: 'Internal server error!' })
  }
}

// Delete a testimonial by ID
const deleteTestimonials = async (req, res) => {
  const { userId } = req.query

  try {
    const testimonial = await Testimonials.findById(req.params.id, {
      isDeleted: false,
    })

    if (!testimonial || testimonial.isDeleted) {
      return res.status(404).json({
        error: true,
        message: 'Testimonial not found or already deleted!',
      })
    }

    // Optional: Delete associated file from S3 (profileId is S3 key; legacy Cloudinary IDs skipped)
    if (testimonial.profileId && testimonial.profileId.includes('/')) {
      try {
        const buckets = getBuckets()
        await deleteFileFromS3(testimonial.profileId, buckets.images)
      } catch (deleteError) {
        console.error('Error deleting file from S3:', deleteError)
      }
    }

    // Soft delete
    testimonial.isDeleted = true
    testimonial.deletedAt = new Date()
    await testimonial.save()

    // Send notification
    try {
      const NotificationData = {
        UserRole: 'Admin',
        title: 'Testimonial',
        message: `A testimonial has been deleted.`,
        RelateRoute: 'testimonial',
        RelatedId: testimonial._id,
      }
      await createNotification({ data: NotificationData })
    } catch (error) {
      console.log({ error: error?.message })
    }

    return res.status(200).json({
      success: true,
      message: 'Testimonial soft-deleted successfully!',
      testimonial,
    })
  } catch (error) {
    console.error('Error deleting testimonial:', error)
    return res
      .status(500)
      .json({ error: true, message: 'Internal server error!' })
  }
}

export {
  createTestimonial,
  getAllTestimonials,
  getTestimonialsById,
  updateTestimonials,
  deleteTestimonials,
}
