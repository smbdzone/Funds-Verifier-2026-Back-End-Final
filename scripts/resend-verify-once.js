import dotenv from 'dotenv'
import mongoose from 'mongoose'
import crypto from 'crypto'
import sendEmail from '../utils/nodeMailer.js'
import User from '../models/userModel.js'

dotenv.config()

const uuid = process.argv[2] || '528fda8a-8969-40aa-a6b0-06dbaff735d3'
const emailArg = process.argv[3]

await mongoose.connect(process.env.DBURL)

let user = await User.findOne({ uuid, isDeleted: false })
if (!user && emailArg) {
  user = await User.findOne({ email: emailArg.toLowerCase(), isDeleted: false })
}

if (!user) {
  console.error('User not found')
  process.exit(1)
}

const token = crypto.randomBytes(32).toString('hex')
user.emailVerificationToken = token
user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000
await user.save()

const link = `https://fundsverifier.com/verify-email?token=${token}&uuid=${user.uuid}`
console.log('Sending to:', user.email)
console.log('LINK:', link)

const result = await sendEmail({
  to: user.email,
  subject: 'Verify Your Email',
  html: `
    <h2>Email Verification</h2>
    <p>Please click the link below to verify your email:</p>
    <a href="${link}">Verify Email</a>
    <p>Link expires in 24 hours.</p>
  `,
})

console.log(result)
await mongoose.disconnect()
