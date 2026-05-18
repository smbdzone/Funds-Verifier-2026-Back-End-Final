import Review from '../models/reviewModel.js'
const sanitizeText = (text = '') => text.replace(/<\/?[^>]+>/gi, '').trim()

// Add a new review
export const addReview = async (req, res) => {
  let { name, email, review, ratingNumber, productTitle, productId } = req.body
  // Sanitize
  name = sanitizeText(name)
  email = sanitizeText(email)
  review = sanitizeText(review)

  // Validation
  if (!name || !review || !productId) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  if (ratingNumber < 1 || ratingNumber > 5) {
    return res.status(400).json({ message: 'Invalid rating' })
  }

  if (name.length > 50 || review.length > 500) {
    return res.status(400).json({ message: 'Input too long' })
  }

  try {
    const newReview = new Review({
      name,
      email,
      review,
      ratingNumber,
      productTitle,
      productUUID: productId,
    })
    await newReview.save()

    res
      .status(201)
      .json({ message: 'Review added successfully', review: newReview })
  } catch (error) {
    res.status(500).json({ message: 'Error adding review', error })
  }
}

// Get reviews by productId from query parameters
export const getReviewsByProductId = async (req, res) => {
  const { productId } = req.query
  try {
    const reviews = await Review.find({
      productUUID: productId,
      isDeleted: false,
    })
    res.status(200).json(reviews)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error })
  }
}

// Get reviews by productId from request body
export const getReviewsByProductIdFromBody = async (req, res) => {
  const { productId } = req.body
  try {
    const reviews = await Review.find({
      productUUID: productId,
      isDeleted: false,
    })
    res.status(200).json(reviews)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error })
  }
}

// Get review count by productId
export const getReviewCounts = async (req, res) => {
  const { productId } = req.body

  try {
    // Ensure that productId is a valid ObjectId
    // const objectId = new mongoose.Types.ObjectId(productId)

    const result = await Review.aggregate([
      { $match: { productUUID: productId } },
      {
        $group: {
          productUUID: '$productUUID',
          reviewCount: { $sum: 1 }, // Count the number of reviews
          averageRating: { $avg: '$ratingNumber' }, // Calculate the average rating
        },
      },
    ])

    if (result.length === 0) {
      return res.status(200).json({ count: 0, averageRating: 0 })
    }

    const { reviewCount, averageRating } = result[0]

    res
      .status(200)
      .json({ count: reviewCount, averageRating: averageRating.toFixed(1) })
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching review count and average rating',
      error: error.message || error,
    })
  }
}
