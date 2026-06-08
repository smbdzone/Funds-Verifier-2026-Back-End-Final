import { multerErrorMessage } from '../utils/uploadLimits.js'

const notFound = (req, res, next) => {
  const error = new Error(`Not Found :${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  // Multer (e.g. wrong field name, file too large, non-PDF on upload-certificate) would
  // otherwise become a generic 500 because res.statusCode is still 200.
  if (err?.name === 'MulterError' || /Unsupported (PDF|image|video) format/i.test(err?.message || '')) {
    return res.status(400).json({
      message: err?.name === 'MulterError' ? multerErrorMessage(err) : err.message,
      status: 400,
    })
  }

  const statusCode = res.statusCode == 200 ? 500 : res.statusCode;
  res.status(statusCode);

  // Environment-based error response (default to production for security)
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Force production mode if NODE_ENV is not explicitly set to development
  const shouldShowStack = isDevelopment && process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    // Log error details server-side for monitoring
    console.error('Error occurred:', {
      message: err?.message,
      stack: err?.stack,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
  }

  // Send appropriate response based on environment
  if (shouldShowStack) {
    // Development: Include stack trace for debugging
    res.json({
      message: err?.message || 'Internal Server Error',
      stack: err?.stack,
      status: statusCode
    });
  } else {
    // Production: Generic error message for security
    res.json({
      message: statusCode === 500 ? 'Internal Server Error' : err?.message || 'Something went wrong',
      status: statusCode
    });
  }
};

export { notFound, errorHandler };