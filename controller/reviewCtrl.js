import Review from '../models/reviewModel.js'

const sanitizeText = (text = '') => text.replace(/<\/?[^>]+>/gi, '').trim()

const PUBLIC_REVIEW_FILTER = {
  isDeleted: false,
  $or: [{ status: 'approved' }, { status: { $exists: false } }],
}

// Add a new review (pending until admin approves)
export const addReview = async (req, res) => {
  let { name, email, review, ratingNumber, productTitle, productId } = req.body

  name = sanitizeText(name)
  email = sanitizeText(email)
  review = sanitizeText(review)
  ratingNumber = Number(ratingNumber)

  if (!name || !email || !review || !productId) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  if (!Number.isFinite(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
    return res.status(400).json({ message: 'Invalid rating' })
  }

  if (name.length > 50 || review.length > 500) {
    return res.status(400).json({ message: 'Input too long' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' })
  }

  try {
    const newReview = new Review({
      name,
      email,
      review,
      ratingNumber,
      productTitle: sanitizeText(productTitle) || 'Listing',
      productUUID: productId,
      status: 'pending',
    })
    await newReview.save()

    res.status(201).json({
      message: 'Review submitted successfully',
      review: newReview,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error adding review', error })
  }
}

export const getReviewsByProductId = async (req, res) => {
  const { productId } = req.query
  try {
    const reviews = await Review.find({
      productUUID: productId,
      ...PUBLIC_REVIEW_FILTER,
    }).sort({ createdAt: -1 })

    res.status(200).json(reviews)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error })
  }
}

export const getReviewsByProductIdFromBody = async (req, res) => {
  const { productId } = req.body
  try {
    const reviews = await Review.find({
      productUUID: productId,
      ...PUBLIC_REVIEW_FILTER,
    }).sort({ createdAt: -1 })

    res.status(200).json(reviews)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error })
  }
}

export const getReviewCounts = async (req, res) => {
  const { productId } = req.body

  try {
    const result = await Review.aggregate([
      {
        $match: {
          productUUID: productId,
          isDeleted: false,
          $or: [{ status: 'approved' }, { status: { $exists: false } }],
        },
      },
      {
        $group: {
          _id: '$productUUID',
          reviewCount: { $sum: 1 },
          averageRating: { $avg: '$ratingNumber' },
        },
      },
    ])

    if (result.length === 0) {
      return res.status(200).json({ count: 0, averageRating: 0 })
    }

    const { reviewCount, averageRating } = result[0]

    res.status(200).json({
      count: reviewCount,
      averageRating: averageRating.toFixed(1),
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching review count and average rating',
      error: error.message || error,
    })
  }
}

export const getAdminReviews = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10))
    const skip = (page - 1) * limit
    const status = String(req.query.status || 'pending').toLowerCase()

    const query = { isDeleted: false }
    if (status === 'all') {
      query.$or = [
        { status: 'approved' },
        { status: 'pending' },
        { status: { $exists: false } },
      ]
    } else if (status === 'pending') {
      query.$or = [{ status: 'pending' }, { status: { $exists: false } }]
    } else {
      query.status = status
    }

    const [reviews, total] = await Promise.all([
      Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(query),
    ])

    res.status(200).json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error })
  }
}

export const updateReviewStatus = async (req, res) => {
  const { reviewId } = req.params
  const status = String(req.body?.status || '').toLowerCase()

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid review status' })
  }

  try {
    const review = await Review.findOneAndUpdate(
      { uuid: reviewId, isDeleted: false },
      { status },
      { new: true },
    )

    if (!review) {
      return res.status(404).json({ message: 'Review not found' })
    }

    res.status(200).json({
      message: `Review ${status}`,
      review,
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating review', error })
  }
}

export const deleteAdminReview = async (req, res) => {
  const { reviewId } = req.params

  try {
    const result = await Review.deleteOne({ uuid: reviewId })

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Review not found' })
    }

    res.status(200).json({ message: 'Review deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error deleting review', error })
  }
}
