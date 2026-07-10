import { getCloudFrontConfig, getCloudFrontPrivateKey } from '../utils/awsConfig.js'
import { getSignedUrl } from 'aws-cloudfront-sign'

export function cloudFrontUrlForKey(s3Key) {
  const { domain } = getCloudFrontConfig()
  const trimmed = String(s3Key || '').replace(/^\/+/, '')
  return `https://${domain}/${trimmed}`
}

let warnedMissingKey = false

export function generateCloudFrontSignedUrl(s3Key, expiresInSeconds = 3600) {
  const url = cloudFrontUrlForKey(s3Key)
  const expireTime = Date.now() + expiresInSeconds * 1000

  try {
    const { keyPairId } = getCloudFrontConfig()
    const privateKey = getCloudFrontPrivateKey()

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
  } catch (error) {
    // In production, preserve the original behaviour: surface signing failures
    // loudly (a missing/invalid key is a real misconfig that must be noticed).
    if (process.env.NODE_ENV === 'production') {
      throw error
    }

    // Non-production only: CloudFront signing isn't configured (e.g. missing
    // private key in local dev). Fall back to the unsigned CloudFront URL so
    // uploads and ad serving don't hard-fail during local testing.
    if (!warnedMissingKey) {
      console.warn(
        'CloudFront signed URLs unavailable (dev) — falling back to unsigned URLs:',
        error?.message,
      )
      warnedMissingKey = true
    }
    return {
      signedUrl: url,
      expiresAt: null,
      expiresInSeconds: null,
      unsigned: true,
    }
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


