import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

const uri =
  'mongodb://fundsverifier1:VBNH00TUX0X0jc6C@ac-o1kat8d-shard-00-00.zfnmndx.mongodb.net:27017,ac-o1kat8d-shard-00-01.zfnmndx.mongodb.net:27017,ac-o1kat8d-shard-00-02.zfnmndx.mongodb.net:27017/fundVerifier?ssl=true&authSource=admin&retryWrites=true&w=majority'

const email = 'smbdigitalzone2@gmail.com'
const password = process.argv[2]
const name = process.argv[3] || 'SMB Digital Zone'

if (!password) {
  console.error('Usage: node seed-evaluator.mjs <password> [name]')
  process.exit(1)
}

await mongoose.connect(uri)
const users = mongoose.connection.collection('users')

const existing = await users.findOne({
  email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
})

if (existing) {
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)
  await users.updateOne(
    { _id: existing._id },
    {
      $set: {
        password: hashedPassword,
        role: 'Evaluator',
        isEmailVerified: true,
        userState: 'active',
        isDeleted: false,
        deletedAt: null,
      },
    },
  )
  console.log(
    JSON.stringify(
      {
        action: 'updated',
        email: existing.email,
        role: 'Evaluator',
        userState: 'active',
        uuid: existing.uuid,
      },
      null,
      2,
    ),
  )
} else {
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)
  const doc = {
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    role: 'Evaluator',
    userState: 'active',
    isEmailVerified: true,
    isDeleted: false,
    uuid: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const result = await users.insertOne(doc)
  console.log(
    JSON.stringify(
      {
        action: 'created',
        _id: String(result.insertedId),
        email: doc.email,
        role: doc.role,
        userState: doc.userState,
        uuid: doc.uuid,
      },
      null,
      2,
    ),
  )
}

const count = await users.countDocuments({
  role: 'Evaluator',
  isDeleted: { $ne: true },
})
console.log('Evaluator count:', count)
await mongoose.disconnect()
