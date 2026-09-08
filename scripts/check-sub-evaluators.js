import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/userModel.js'

dotenv.config()

const parentKeys = [
  '1756fef8-e921-4f60-8d93-0603f06ad037',
  '6a1d82b87ac399c244a9bf18',
]

await mongoose.connect(process.env.DBURL)
const subs = await User.find({
  parentEvaluator: { $in: parentKeys },
  isDeleted: { $ne: true },
}).select('name email role uuid parentEvaluator userState _id')

console.log(JSON.stringify(subs, null, 2))
await mongoose.disconnect()
