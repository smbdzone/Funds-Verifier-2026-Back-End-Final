import { getCloudFrontConfig, getCloudFrontPrivateKey } from '../utils/awsConfig.js'
import { getSignedUrl } from 'aws-cloudfront-sign'

export function cloudFrontUrlForKey(s3Key) {
  const { domain } = getCloudFrontConfig()
  const trimmed = String(s3Key || '').replace(/^\/+/, '')
  return `https://${domain}/${trimmed}`
}

export function generateCloudFrontSignedUrl(s3Key, expiresInSeconds = 3600) {
  const { keyPairId } = getCloudFrontConfig()
  const privateKey = getCloudFrontPrivateKey()

  const url = cloudFrontUrlForKey(s3Key)
  const expireTime = Date.now() + expiresInSeconds * 1000

  const signedUrl = getSignedUrl(url, {
    keypairId: keyPairId,
    privateKeyString: privateKey,
    expireTime,
  })

  return {
    signedUrl,
    expiresAt: new Date(expireTime),
    expiresInSeconds,
  }
}

/**
 * Generate URL for an asset based on access type
 * @param {string} s3Key - S3 object key
 * @param {boolean} isPublic - Whether the asset should be publicly accessible
 * @param {number} expiresInSeconds - Expiry time for private URLs (default: 1 hour)
 * @returns {Object} URL information with signedUrl, expiresAt, expiresInSeconds, isPublic
 */
export function generateAssetUrl(s3Key, isPublic = false, expiresInSeconds = 3600) {
  if (!s3Key) {
    return null
  }

  if (isPublic) {
    // Public URL: Use CloudFront unsigned URL (requires CloudFront distribution to allow public access)
    // For truly public access, CloudFront distribution should not require signed URLs
    const publicUrl = cloudFrontUrlForKey(s3Key)
    return {
      url: publicUrl,
      signedUrl: publicUrl, // Same for public
      isPublic: true,
      expiresAt: null, // Public URLs don't expire
      expiresInSeconds: null,
      urlType: 'cloudfront-public',
    }
  } else {
    // Private URL: Generate CloudFront signed URL with expiry
    try {
      const signedResult = generateCloudFrontSignedUrl(s3Key, expiresInSeconds)
      return {
        url: signedResult.signedUrl,
        signedUrl: signedResult.signedUrl,
        isPublic: false,
        expiresAt: signedResult.expiresAt,
        expiresInSeconds: signedResult.expiresInSeconds,
        urlType: 'cloudfront-signed',
      }
    } catch (error) {
      console.error('Error generating private signed URL:', error)
      throw new Error(`Failed to generate private URL: ${error.message}`)
    }
  }
}


