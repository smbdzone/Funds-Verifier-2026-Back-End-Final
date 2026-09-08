import Blog from '../models/blogModel.js'
import BlogComment from '../models/blogCommentModel.js'

const sanitizeText = (text = '') => text.replace(/<\/?[^>]+>/gi, '').trim()

const PUBLIC_COMMENT_FILTER = {
  isDeleted: false,
  status: 'approved',
}

function applyPublicBlogVisibilityFilter(query) {
  query.status = 'Active'
}

async function findActiveBlogByUuid(blogUuid) {
  const query = {
    uuid: blogUuid,
    $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
  }
  applyPublicBlogVisibilityFilter(query)
  return Blog.findOne(query)
}

export const addBlogComment = async (req, res) => {
  let { name, email, comment, blogUuid } = req.body

  name = sanitizeText(name)
  email = sanitizeText(email)
  comment = sanitizeText(comment)
  blogUuid = sanitizeText(blogUuid)

  if (!name || !email || !comment || !blogUuid) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  if (name.length > 80 || comment.length > 1000) {
    return res.status(400).json({ message: 'Input too long' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' })
  }

  try {
    const blog = await findActiveBlogByUuid(blogUuid)
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' })
    }

    const newComment = new BlogComment({
      name,
      email,
      comment,
      blogUuid,
      blogTitle: sanitizeText(blog.title) || 'Blog article',
      status: 'pending',
    })
    await newComment.save()

    res.status(201).json({
      message:
        'Comment submitted successfully. It will appear after admin approval.',
      data: {
        uuid: newComment.uuid,
        status: newComment.status,
      },
    })
  } catch (error) {
    console.error('Error adding blog comment:', error)
    res.status(500).json({ message: 'Error posting comment' })
  }
}

export const getBlogComments = async (req, res) => {
  const { blogUuid } = req.params
  const sanitizedUuid = sanitizeText(blogUuid)

  if (!sanitizedUuid) {
    return res.status(400).json({ message: 'Blog id is required' })
  }

  try {
    const blog = await findActiveBlogByUuid(sanitizedUuid)
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' })
    }

    const comments = await BlogComment.find({
      blogUuid: sanitizedUuid,
      ...PUBLIC_COMMENT_FILTER,
    })
      .sort({ createdAt: -1 })
      .select('uuid name comment createdAt')
      .lean()

    res.json({ data: comments })
  } catch (error) {
    console.error('Error fetching blog comments:', error)
    res.status(500).json({ message: 'Error fetching comments' })
  }
}

export const getAdminBlogComments = async (req, res) => {
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

    const [comments, total] = await Promise.all([
      BlogComment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BlogComment.countDocuments(query),
    ])

    res.status(200).json({
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    })
  } catch (error) {
    console.error('Error fetching admin blog comments:', error)
    res.status(500).json({ message: 'Error fetching comments' })
  }
}

export const updateBlogCommentStatus = async (req, res) => {
  const { commentId } = req.params
  const status = String(req.body?.status || '').toLowerCase()

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Invalid comment status' })
  }

  try {
    const comment = await BlogComment.findOneAndUpdate(
      { uuid: commentId, isDeleted: false },
      { status },
      { new: true },
    )

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' })
    }

    res.status(200).json({
      message: `Comment ${status}`,
      comment,
    })
  } catch (error) {
    console.error('Error updating blog comment status:', error)
    res.status(500).json({ message: 'Error updating comment' })
  }
}

export const deleteAdminBlogComment = async (req, res) => {
  const { commentId } = req.params

  try {
    const result = await BlogComment.deleteOne({ uuid: commentId })

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Comment not found' })
    }

    res.status(200).json({ message: 'Comment deleted successfully' })
  } catch (error) {
    console.error('Error deleting blog comment:', error)
    res.status(500).json({ message: 'Error deleting comment' })
  }
}
