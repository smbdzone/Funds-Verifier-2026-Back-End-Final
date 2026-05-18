/**
 * Upload image to S3 (replaces Cloudinary).
 * Use uploadImageToS3 from s3UploadService.js for new code.
 */
import { uploadImageToS3 } from './s3UploadService.js'
import { generateCloudFrontSignedUrl } from './cloudFrontSignedUrlService.js'


export const uploadImage = async (file, folder, userUUID = 'uploads') => {
  const fileObj = {
    buffer: Buffer.isBuffer(file) ? file : Buffer.from(file),
    originalname: `upload-${Date.now()}.jpg`,
    mimetype: 'image/jpeg',
  }
  const result = await uploadImageToS3(fileObj, userUUID, true)
  const signed = generateCloudFrontSignedUrl(result.key, 10 * 365 * 24 * 60 * 60)
  return {
    secure_url: signed.signedUrl,
    url: signed.signedUrl,
    public_id: result.key,
    key: result.key,
  }
}
