// import { v4 as uuidv4 } from 'uuid'
// import dotenv from 'dotenv'
// dotenv.config({ path: './.env' }) // Add this
// import dbConnection from '../config/dbConnect.js'
// import User from '../models/userModel.js'
// import Car from '../models/carModel.js'
// import Boat from '../models/boatModel.js'
// import UserPaymentDetails from '../models/UserPaymentDetails.js'
// import AdsWallet from '../models/AdsWalletModel.js'
// import model from '../models/advertisement.js'
// import UserProfile from '../models/assetHolderModel.js'
// import Category from '../models/blogCategoryModel.js'
// import BlogImage from '../models/BlogImageModel.js'
// import Blog from '../models/blogModel.js'
// import Booking from '../models/Booking.js'
// import Broker from '../models/BrokerModal.js'
// import Cart from '../models/cartModel.js'
// import Contact from '../models/Contact.js'
// import CreateAssets from '../models/create-assets.model.js'
// import DealHunterDoc from '../models/dealHunterDocModel.js'
// import DealHunter from '../models/dealHunterModel.js'
// import DealPreference from '../models/dealPreference.model.js'
// import ElectronicConsent from '../models/electronicConsent.model.js'
// import EvaluatorProfile from '../models/evaluatorModel.js'
// import EvaluationCertificate from '../models/evaluationCertificateModel.js'
// import ImageAsset from '../models/imgModel.js'
// import Jewelry from '../models/jewelryModel.js'
// import Notifications from '../models/notificationsModel.js'
// import Order from '../models/orderModel.js'
// import platFormFee from '../models/platFormFee.js'
// import Price from '../models/priceModel.js'
// import Profile from '../models/profile.model.js'
// import Property from '../models/propertyModel.js'
// import ReportTechnical from '../models/reportModel.js'
// import Request3D from '../models/request3DModel.js'
// import RequestedItemsPrice from '../models/RequestedItemsPriceModel.js'
// import Review from '../models/reviewModel.js'
// import Slot from '../models/Slot.js'
// import Testimonials from '../models/testimonialsModel.js'
// import ThumbnailImg from '../models/thumbnailModel.js'
// import Transaction from '../models/transactionModel.js'
// import TransactionTracker from '../models/TransactionTrackerModel.js'
// import VideoAsset from '../models/videoModel.js'
// import mongoose from 'mongoose'

// const mongooseUrl = process.env.DBURL

// async function addUUIDs(Model, name) {
//   const docs = await Model.find({ uuid: { $exists: false } }, { _id: 1 })

//   console.log(`→ ${name}: ${docs.length} missing uuid`)

//   for (const doc of docs) {
//     await Model.updateOne({ _id: doc._id }, { $set: { uuid: uuidv4() } }).catch(
//       (e) => {
//         console.log(`❌ Failed for ${name} ID: ${doc._id}`, e.message)
//       }
//     )
//   }

//   console.log(`✔ ${name}: UUIDs added successfully`)
// }

// async function run() {
//   try {
//     console.log('⏳ Connecting to MongoDB...')

//     await dbConnection()
//     mongoose.set('strictQuery', false)
//     mongoose.set('runValidators', false)
//     // await addUUIDs(User, 'User')
//     // await addUUIDs(Car, 'Car')
//     // await addUUIDs(Boat, 'Boat')
//     // await addUUIDs(EvaluatorProfile, 'EvaluatorProfile')
//     // await addUUIDs(Profile, 'Profile')
//     // await addUUIDs(UserPaymentDetails, 'UserPaymentDetails')
//     // await addUUIDs(AdsWallet, 'AdsWallet')
//     // await addUUIDs(model, 'Advertisement')
//     // await addUUIDs(UserProfile, 'UserProfile')
//     // await addUUIDs(Category, 'Category')
//     // await addUUIDs(BlogImage, 'BlogImage')
//     // await addUUIDs(Blog, 'Blog')
//     // await addUUIDs(Booking, 'Booking')
//     // await addUUIDs(Broker, 'Broker')
//     // await addUUIDs(Cart, 'Cart')
//     // await addUUIDs(Contact, 'Contact')
//     // await addUUIDs(CreateAssets, 'CreateAssets')
//     // await addUUIDs(DealHunterDoc, 'DealHunterDoc')
//     // await addUUIDs(DealHunter, 'DealHunter')
//     // await addUUIDs(DealPreference, 'DealPreference')
//     // await addUUIDs(ElectronicConsent, 'ElectronicConsent')
//     // await addUUIDs(EvaluationCertificate, 'EvaluationCertificate')
//     // await addUUIDs(ImageAsset, 'ImageAsset')
//     // await addUUIDs(Jewelry, 'Jewelry')
//     // await addUUIDs(Notifications, 'Notifications')
//     // await addUUIDs(Order, 'Order')
//     // await addUUIDs(platFormFee, 'platFormFee')
//     // await addUUIDs(Price, 'Price')
//     // await addUUIDs(Property, 'Property')
//     // await addUUIDs(ReportTechnical, 'ReportTechnical')
//     // await addUUIDs(Request3D, 'Request3D')
//     // await addUUIDs(RequestedItemsPrice, 'RequestedItemsPrice')
//     // await addUUIDs(Review, 'Review')
//     // await addUUIDs(Slot, 'Slot')
//     // await addUUIDs(Testimonials, 'Testimonials')
//     // await addUUIDs(ThumbnailImg, 'ThumbnailImg')
//     await addUUIDs(Transaction, 'Transaction')
//     await addUUIDs(TransactionTracker, 'TransactionTracker')
//     await addUUIDs(VideoAsset, 'VideoAsset')

//     console.log('\n🎉 UUID Migration Complete!')
//     process.exit(0)
//   } catch (error) {
//     console.error('❌ Migration error:', error)
//     process.exit(1)
//   }
// }

// run()
// import dotenv from 'dotenv'
// import mongoose from 'mongoose'

// dotenv.config()

// async function rebuildIndex() {
//   try {
//     await mongoose.connect(process.env.DBURL)
//     console.log('Connected to MongoDB')

//     const collection = mongoose.connection.collection('users')

//     // Drop old index
//     try {
//       await collection.dropIndex('documentation.uuid_1')
//       console.log('Old index dropped.')
//     } catch (e) {
//       console.log('Index did not exist or already dropped.')
//     }

//     // Create unique sparse index
//     await collection.createIndex(
//       { 'documentation.uuid': 1 },
//       { unique: true, sparse: true }
//     )

//     console.log('Unique sparse index created on documentation.uuid.')
//     process.exit()
//   } catch (err) {
//     console.error('Error rebuilding index:', err)
//     process.exit(1)
//   }
// }

// rebuildIndex()
import mongoose from 'mongoose'
import dotenv from 'dotenv'
async function wipeData() {
  dotenv.config()
  await mongoose.connect(process.env.DBURL)

  const collections = await mongoose.connection.db.collections()

  for (let collection of collections) {
    await collection.deleteMany({})
    console.log(`Cleared: ${collection.collectionName}`)
  }

  await mongoose.disconnect()
  console.log('All collections cleared, structure preserved.')
}

wipeData()
