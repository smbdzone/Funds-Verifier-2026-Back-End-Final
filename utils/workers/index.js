// worker.js
import { Worker } from 'bullmq'
import { redis } from '../../libs/redis.js'
import UserPaymentDetails from '../../models/UserPaymentDetails.js'
import Stripe from 'stripe'
import nodemailer from 'nodemailer'
import MailSendForEvaluationFees from '../../utils/templates/MailSendForEvaluationFees.js'
import User from '../../models/userModel.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Create a transporter object using your email provider's service
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

function StartPaymentWorker() {
  try {
    const worker = new Worker(
      'evaluation-payment',
      async (job) => {
        const data = job?.data
        if (data?.PaymentDetailsId) {
          const PaymentDetails = await UserPaymentDetails.findById(
            data?.PaymentDetailsId
          )
          const user = await User.findById(data?.userId, {
            isDeleted: false,
          }).select('email name')

          const paymentIntent = await stripe.paymentIntents.create({
            amount: 250000, // 2,500 AED (in fils)
            currency: 'aed',
            customer: PaymentDetails?.customerId,
            payment_method: PaymentDetails?.paymentMethod,
            off_session: true,
            confirm: true,
          })
          const assetTitle = data?.assetTitle || null

          if (!paymentIntent?.status || paymentIntent?.status !== 'succeeded') {
            throw new Error('Payment failed')
          } else {
            try {
              const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user?.email,
                subject: 'Evaluation Fee Payment Successful',
                html: MailSendForEvaluationFees({
                  name: user?.name,
                  assetTitle: assetTitle,
                  amount: 2500,
                }),
              }
              await transporter.sendMail(mailOptions)
            } catch (error) {
              console.log('failed to send mail: ', error?.message)
            }
          }
        }
      },
      { connection: redis }
    )

    worker.on('completed', (job) => {})

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err?.message)
    })
  } catch (error) {
    console.error('Worker initialization failed:', error?.message)
  }
}

export default StartPaymentWorker
