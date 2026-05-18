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


const localOrigin = [
  'http://localhost:5002',
  'http://localhost:3011',
]
// Configure CORS
const corsOptions = {
  origin: [
    'https://fv.admin.fundsverifier.com',
    'https://fundsverifier.com',
    ...(process.env.NODE_ENV === 'development' ? localOrigin : [])
  ],
  credentials: true, // Allow credentials (cookies)
}

dotenv.config()
const app = express()

// Configure Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'http:', 'res.cloudinary.com'],
        connectSrc: ["'self'", 'https:', 'http:', 'res.cloudinary.com'],
        frameSrc: ["'none'"],
      },
    },
    xssFilter: true,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  })
)


app.use(morgan('tiny'))
app.disable('x-powered-by')

// Use JSON parser and CORS middleware
app.use(express.json({ limit: '20mb' }))
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
