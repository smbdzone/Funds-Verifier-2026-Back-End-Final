import express from 'express'
import propertyRoute from './propertyRoute.js'
import carRoute from './carRoute.js'
import boatRoute from './boatRoute.js'
import jewelryRoute from './jewelryRoute.js'
import assetRoute from './assetroute.js'
import emailRoute from './emailRoute.js'
import assetHolder from './assetHolderRoute.js'
import dealHunter from './dealHunterRoute.js'
// import profileRoute from './profile.routes.js'
import dealPreferenceRoute from './dealPreference.routes.js'
import electronicConsentRoute from './electronicConsent.routes.js'
import adminEvaluatorRoute from './adminEvaluatorRoute.js'
import evaluatorRoute from './evaluatorRoute.js'
import request3dRoute from './request3dRoute.js'
import bookingRoute from './bookingRoute.js'
import reviewRoute from './reviewRoute.js'
import reportRoute from './reportRoute.js'
import countries from './contactRouter.js'
import viewBooking from './viewingRoutes.js'
import createAssets from './create-assets.routes.js'
import prices from './priceRoute.js'
import userRouter from './userRoutes.js'
import transactionRouter from './transactionRoute.js'
import platformFee from './platformFeeRoute.js'
import successFeeRoute from './successFeeRoute.js'
import blogRoute from './blogRouter.js'
import countriesRoute from './countriesRoute.js'
import advertisementRoute from './advertisementRoute.js'
import Testimonials from './testimonials.routes.js'
import Notifications from './NotificationsRoutes.js'
import transactionTrackerRoute from './transactionTrackerRoute.js'
import RevenueRoute from './RevenueRoute.js'
import RequestedItemsPriceRoutes from './RequestedItemsPriceRoutes.js'
import SalesTrackerRoute from './SalesTrackerRoute.js'
import PurchaseTrackerRoute from './PurchaseTrackerRoute.js'
import ServicesRoutes from './ServicesRoutes.js'
import AssignAssetsRoutes from './AssignAssetsRoutes.js'
import contactRoutes from './contactRoutes.js'
import publicRoutes from './publicToken.js'
import testRoute from './testRoute.js'
import { createPaymentIntent } from '../controller/createPaymentIntentCtrl.js'
import { pdfPreviewProxy } from '../controller/pdfPreviewCtrl.js'

const router = express.Router()

router.get('/pdf-preview', pdfPreviewProxy)
router.post('/create-payment-intent', createPaymentIntent)

router.use('/user', userRouter)
router.use('/public', publicRoutes)
router.use('/contact-us', contactRoutes)
router.use('/property', propertyRoute)
router.use('/price', prices)
router.use('/advertisement', advertisementRoute)
router.use('/car', carRoute)
router.use('/boat', boatRoute)
router.use('/jewelry', jewelryRoute)
router.use('/', assetRoute)
router.use('/platform-fee', platformFee)
router.use('/success-fee', successFeeRoute)
router.use('/pay', transactionRouter)
router.use('/blog', blogRoute)
router.use('/countries', countriesRoute)
router.use('/email', emailRoute)
router.use('/assetHolder', assetHolder)
router.use('/dealHunter', dealHunter)
// router.use('/profile', profileRoute)
router.use('/dealPreferences', dealPreferenceRoute)
router.use('/electronicConsent', electronicConsentRoute)
router.use('/admin', adminEvaluatorRoute)
router.use('/evaluator', evaluatorRoute)
router.use('/request3d', request3dRoute)
router.use('/booking', bookingRoute)
router.use('/reviews', reviewRoute)
router.use('/report', reportRoute)
router.use('/country', countries)
router.use('/arrange-view', viewBooking)
router.use('/create-assets', createAssets)
router.use('/testimonials', Testimonials)
router.use('/notifications', Notifications)
router.use('/transactions/tracker', transactionTrackerRoute)
router.use('/sales/tracker', SalesTrackerRoute)
router.use('/purchases/tracker', PurchaseTrackerRoute)
router.use('/payment/revenue', RevenueRoute)
router.use('/assets/prices', RequestedItemsPriceRoutes)
router.use('/assets/assign', AssignAssetsRoutes)
router.use('/services', ServicesRoutes)
router.use('/test', testRoute)

export default router
