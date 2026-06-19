import express from 'express'
import cors from 'cors'
import http from 'http'
import helmet from 'helmet'

import routes from './routes/index.js'
import dbConnection from './config/dbConnect.js'
import sendEmail from './utils/contactmail.js'
import calenderEmail from './utils/calendermail.js'
import path from 'path'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import morgan from 'morgan'
import mongoSanitize from 'express-mongo-sanitize'
import StartPaymentWorker from './utils/workers/index.js'
import { errorHandler, notFound } from './middlewares/errorHandler.js'
import { apiLimiter, contactFormLimiter, emailFormLimiter } from './middlewares/rateLimiter.js'
import { initSocket } from './utils/socket.js'
import initNotificationSocket from './sockets/notificationSocket.js'
import { csrfProtection } from './middlewares/csrfMiddleware.js'

dotenv.config()

const localOrigin = [
  'http://localhost:5002',
  'http://localhost:3011',
  'http://127.0.0.1:5002',
  'http://127.0.0.1:3011',
]

function buildCorsOrigins() {
  const defaults = [
    'https://fv.admin.fundsverifier.com',
    'https://fundsverifier.com',
  ]
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const origins = [...new Set([...defaults, ...extra])]
  if (process.env.NODE_ENV !== 'production') {
    origins.push(...localOrigin)
  }
  return origins
}

const corsOptions = {
  origin: buildCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-csrf-token',
    'X-CSRF-Token',
    'x-public-token',
    'x-api-key',
    'X-API-Key',
  ],
}
const app = express()

// Configure Helmet for security headers
const isProduction = process.env.NODE_ENV === 'production'
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'http:', 'res.cloudinary.com'],
        connectSrc: ["'self'", 'https:', 'http:', 'res.cloudinary.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    xssFilter: true,
    xContentTypeOptions: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  }),
)


app.use(morgan('tiny'))
app.disable('x-powered-by')

// Use JSON parser and CORS middleware
app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl?.includes('/clozer/installment-updates')) {
        req.rawBody = buf.toString('utf8')
      }
    },
  }),
)
app.use(cors(corsOptions))
app.use(cookieParser())

app.use(
  mongoSanitize({ replaceWith: '_' })
)

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.static(path.join(__dirname, 'public')))

// Connect to the database
dbConnection()

// Define routes
app.get('/', (req, res) => {
  res.status(200).send('welcome to FV Backend')
})
// Apply to all requests
app.use('/api', apiLimiter)
app.use('/api', csrfProtection)
//routes
app.use('/api/', routes)

// Error handling middleware (must be after routes)
app.use(notFound)
app.use(errorHandler)
// app.use(clientIPMiddleware)

app.post('/api/contact', contactFormLimiter, async (req, res) => {
  const { name, email, message } = req.body

  const result = await sendEmail({ name, email, message })

  if (result.success) {
    return res.status(200).json({ message: 'Email sent successfully' })
  } else {
    return res
      .status(500)
      .json({ message: 'Failed to send email', error: result.error })
  }
})

app.post('/api/schedule', emailFormLimiter, async (req, res) => {
  const { selectedDate, selectedTime, productData } = req.body

  const result = await calenderEmail({
    selectedDate,
    selectedTime,
    productData,
  })

  if (result.success) {
    return res.status(200).json({ message: 'Email sent successfully' })
  } else {
    return res
      .status(500)
      .json({ message: 'Failed to send email', error: result.error })
  }
})

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.IO
initSocket(server)

// Initialize notification socket handlers
initNotificationSocket()

// Start the server
server.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`)
  console.log(`Socket.IO server initialized on port ${process.env.PORT}`)
})

// Message Queue worker functions and jobs
StartPaymentWorker()
