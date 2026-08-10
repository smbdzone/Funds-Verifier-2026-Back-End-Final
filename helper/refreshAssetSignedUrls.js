/**
 * Generates fresh CloudFront signed URLs for listing media on every read.
 *
 * Why: at upload time we store a `signedUrl` alongside the unsigned `url`,
 * but the signature expires (~1 hour). Persisting that URL means cards/details
 * break once the signature expires. Regenerating per-request with the saved
 * `s3Key` always returns a working URL.
 *
 * The helper is non-destructive: it sets `signedUrl` on each asset entry and
 * leaves the original `url` untouched, so any code path can prefer whichever
 * one is appropriate.
 *
 * Duplicate-sign guard: populate hooks + listing hooks + controller "safety
 * nets" used to re-sign the same entries 2–3× per request. We mark entries /
 * listings after a successful refresh so later passes in the same request are
 * no-ops (no extra CloudFront/S3 crypto).
 *
 * Implementation note: the CloudFront signer is imported lazily so that
 * modules attaching this helper as a Mongoose hook can be loaded before
 * `dotenv.config()` runs without triggering env-var validation at boot.
 */

const DEFAULT_EXPIRY_SECONDS = 6 * 60 * 60 // 6 hours

/** Per media entry — set after we sign in this process/request. */
const SIGNED_AT = Symbol.for('fv.mediaSignedAt')
/** Per listing doc — set after a full listing media refresh walk. */
const LISTING_MEDIA_REFRESHED = Symbol.for('fv.listingMediaRefreshed')
/** Per asset doc (ImageAsset / VideoAsset / Thumbnail). */
const ASSET_DOC_REFRESHED = Symbol.for('fv.assetDocRefreshed')

/**
 * Sign URLs against CloudFront for the images bucket (the only origin attached
 * to our CloudFront distribution) and against S3 directly for every other
 * bucket (videos, documents, etc.). Mixing the two means clients keep getting
 * a single `signedUrl` field while we sidestep the misrouted CloudFront origin
 * for videos/documents — see services/s3PresignedUrlService.js for context.
 */
let _cloudFrontSigner
let _s3PresignSigner
let _cloudFrontBucket

async function getCloudFrontSigner() {
  if (_cloudFrontSigner) return _cloudFrontSigner
  const mod = await import('../services/cloudFrontSignedUrlService.js')
  _cloudFrontSigner = mod.generateCloudFrontSignedUrl
  return _cloudFrontSigner
}

async function getS3Signer() {
  if (_s3PresignSigner) return _s3PresignSigner
  const mod = await import('../services/s3PresignedUrlService.js')
  _s3PresignSigner = mod.generateS3PresignedUrl
  return _s3PresignSigner
}

function getCloudFrontBucket() {
  // Cached after first read so we don't repeatedly touch process.env.
  if (_cloudFrontBucket !== undefined) return _cloudFrontBucket
  _cloudFrontBucket = process.env.AWS_S3_BUCKET_IMAGES || null
  return _cloudFrontBucket
}

async function getSigners() {
  const [cf, s3] = await Promise.all([getCloudFrontSigner(), getS3Signer()])
  return { cf, s3, cfBucket: getCloudFrontBucket() }
}

/**
 * True when this entry was already signed earlier in the same request
 * (or still has a usable signedUrl from that pass).
 */
function alreadySignedFresh(entry, expiresInSeconds) {
  if (!entry || typeof entry !== 'object') return false
  const signedAt = entry[SIGNED_AT]
  if (!signedAt || typeof entry.signedUrl !== 'string' || !entry.signedUrl) {
    return false
  }
  // Re-sign if we are within 5 minutes of the configured expiry window.
  const freshForMs = Math.max(60, expiresInSeconds - 5 * 60) * 1000
  return Date.now() - signedAt < freshForMs
}

async function signOne(entry, expiresInSeconds, signers, force = false) {
  if (!entry || typeof entry !== 'object' || !entry.s3Key || !signers) return
  if (!force && alreadySignedFresh(entry, expiresInSeconds)) return

  const { cf, s3, cfBucket } = signers
  try {
    if (!entry.s3Bucket || entry.s3Bucket === cfBucket) {
      const { signedUrl } = cf(entry.s3Key, expiresInSeconds)
      entry.signedUrl = signedUrl
    } else {
      const { signedUrl } = await s3(entry.s3Bucket, entry.s3Key, expiresInSeconds)
      entry.signedUrl = signedUrl
    }
    entry[SIGNED_AT] = Date.now()
  } catch (err) {
    console.warn(
      'refreshAssetSignedUrls: failed to sign',
      entry.s3Bucket,
      entry.s3Key,
      err?.message,
    )
  }
}

async function signArray(arr, expiresInSeconds, signers, force = false) {
  if (!Array.isArray(arr)) return
  await Promise.all(
    arr.map((item) => signOne(item, expiresInSeconds, signers, force)),
  )
}

const OFF_PLAN_LAYOUT_MEDIA_KEYS = [
  'unitLayout',
  'floorPlan',
  'studioLayout',
  'oneBhkLayout',
  'twoBhkLayout',
  'twoBhkDuplexLayout',
  'threeBhkDuplexLayout',
  'penthouseLayout',
]

const EXTRA_IMAGE_ASSET_KEYS = ['qrScan']

async function refreshListingMediaSignedUrlsImpl(
  doc,
  expiresInSeconds,
  signers,
  force = false,
) {
  if (!doc || typeof doc !== 'object') return doc
  // Same listing already walked this request (hook + controller safety net).
  if (!force && doc[LISTING_MEDIA_REFRESHED]) return doc

  await Promise.all([
    signArray(doc?.pictures?.images, expiresInSeconds, signers, force),
    signArray(doc?.thumbnailImg?.images, expiresInSeconds, signers, force),
    signArray(doc?.video?.videos, expiresInSeconds, signers, force),
    ...OFF_PLAN_LAYOUT_MEDIA_KEYS.map((key) =>
      signArray(doc?.[key]?.images, expiresInSeconds, signers, force),
    ),
    ...EXTRA_IMAGE_ASSET_KEYS.map((key) =>
      signArray(doc?.[key]?.images, expiresInSeconds, signers, force),
    ),
  ])

  doc[LISTING_MEDIA_REFRESHED] = true
  return doc
}

async function refreshAssetDocSignedUrlsImpl(doc, expiresInSeconds, signers) {
  if (!doc || typeof doc !== 'object') return doc
  if (doc[ASSET_DOC_REFRESHED]) return doc

  await Promise.all([
    signArray(doc.images, expiresInSeconds, signers),
    signArray(doc.videos, expiresInSeconds, signers),
  ])

  doc[ASSET_DOC_REFRESHED] = true
  return doc
}

/**
 * Walks a populated listing doc and refreshes signedUrl on:
 *   pictures.images[]
 *   thumbnailImg.images[]
 *   video.videos[]
 *
 * Returns the same object for chaining. Safe on `null`/partial docs.
 * Pass `{ force: true }` to re-sign even if a shorter-lived URL was signed
 * earlier in the same request (needed for long-lived email thumbnails).
 */
export async function refreshListingMediaSignedUrls(
  doc,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
  options = {},
) {
  const signers = await getSigners()
  return refreshListingMediaSignedUrlsImpl(
    doc,
    expiresInSeconds,
    signers,
    Boolean(options?.force),
  )
}

/** Apply to an array of populated listing docs. */
export async function refreshListingsMediaSignedUrls(
  docs,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
) {
  if (!Array.isArray(docs)) return docs
  const signers = await getSigners()
  await Promise.all(
    docs.map((d) =>
      refreshListingMediaSignedUrlsImpl(d, expiresInSeconds, signers),
    ),
  )
  return docs
}

/**
 * Mongoose post-find hook that refreshes signed URLs on any populated media.
 *
 * Prefer asset-doc hooks (ImageAsset/Video/Thumbnail) for populate paths;
 * keep this available for any remaining listing-level attachments.
 *
 * Attach with:
 *   schema.post('find', attachListingMediaRefreshHook)
 *   schema.post('findOne', attachListingMediaRefreshHook)
 *   schema.post('findOneAndUpdate', attachListingMediaRefreshHook)
 *
 * The helper is a no-op when `pictures`/`video`/`thumbnailImg` are still
 * ObjectIds (not populated), so it's safe to attach unconditionally.
 */
export async function attachListingMediaRefreshHook(result) {
  if (!result) return
  const signers = await getSigners()
  if (Array.isArray(result)) {
    await Promise.all(
      result.map((d) =>
        refreshListingMediaSignedUrlsImpl(d, DEFAULT_EXPIRY_SECONDS, signers),
      ),
    )
  } else {
    await refreshListingMediaSignedUrlsImpl(result, DEFAULT_EXPIRY_SECONDS, signers)
  }
}

/**
 * Refresh signed URLs on an ImageAsset/ThumbnailImg/VideoAsset document.
 * These documents store the media entries directly under `images` or `videos`
 * (no parent wrapper), so the listing-level helper would miss them.
 */
export async function refreshAssetDocSignedUrls(
  doc,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
) {
  const signers = await getSigners()
  return refreshAssetDocSignedUrlsImpl(doc, expiresInSeconds, signers)
}

/** Mongoose post-find hook for raw asset collections. */
export async function attachAssetDocRefreshHook(result) {
  if (!result) return
  const signers = await getSigners()
  if (Array.isArray(result)) {
    await Promise.all(
      result.map((d) =>
        refreshAssetDocSignedUrlsImpl(d, DEFAULT_EXPIRY_SECONDS, signers),
      ),
    )
  } else {
    await refreshAssetDocSignedUrlsImpl(result, DEFAULT_EXPIRY_SECONDS, signers)
  }
}
