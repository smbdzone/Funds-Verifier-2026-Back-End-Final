// // import jwt from 'jsonwebtoken'
// // import User from '../models/userModel.js' // your User model
// // import roles from '../constants/moduleCreatePermissions.js'

// // // Middleware: Only AssetHolder can create modules
// // export const assetHolderCreate = async (req, res, next) => {
// //   try {
// //     const authHeader = req.headers.authorization
// //     if (!authHeader || !authHeader.startsWith('Bearer ')) {
// //       return res
// //         .status(401)
// //         .json({ message: 'Unauthorized: No token provided' })
// //     }

// //     const token = authHeader.split(' ')[1]

// //     let decoded
// //     try {
// //       decoded = jwt.verify(token, process.env.SECRET_KEY)
// //     } catch (err) {
// //       return res.status(401).json({ message: 'Unauthorized: Invalid token' })
// //     }

// //     const userId = decoded.id // assuming your JWT payload has `id`
// //     const user = await User.findById(userId)

// //     if (!user) {
// //       return res.status(404).json({ message: 'User not found' })
// //     }

// //     const userRole = user.role

// //     if (userRole !== 'AssetHolder') {
// //       return res
// //         .status(403)
// //         .json({ message: 'Forbidden: Only AssetHolder can create' })
// //     }

// //     // Optional: check if create permission exists in your roles object
// //     if (!roles[userRole]?.create) {
// //       return res.status(403).json({
// //         message: 'Forbidden: AssetHolder does not have create permission',
// //       })
// //     }

// //     req.user = user // attach user object to request
// //     next()
// //   } catch (err) {
// //     console.error('AssetHolder create middleware error:', err)
// //     res.status(500).json({ message: 'Server error in AssetHolder middleware' })
// //   }
// // }
// import jwt from 'jsonwebtoken'
// import User from '../models/userModel.js'
// import roles from '../constants/moduleCreatePermissions.js'
// import Property from '../models/propertyModel.js'
// import Car from '../models/carModel.js'
// import Boat from '../models/boatModel.js'
// import Jewelry from '../models/jewelryModel.js'
// import { logSuspiciousActivity } from './logSuspicious.js'

// const assetModels = {
//   Property,
//   Car,
//   Boat,
//   Jewelry,
// }

// export const assetHolderCreate = async (req, res, next) => {
//   try {
//     // ✅ Get token from header
//     const authHeader = req.headers.authorization // this ALWAYS contains token
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       await logSuspiciousActivity(req, 'Missing or invalid token')
//       return res.status(401).json({
//         success: false,
//         message: 'Unauthorized: No token provided',
//       })
//     }
//     console.log({ authHeader })

//     const token = authHeader?.split(' ')[1]

//     let decoded
//     try {
//       decoded = jwt.verify(token, process.env.SECRET_KEY)
//     } catch (err) {
//       return res.status(401).json({ message: 'Unauthorized: Invalid token' })
//     }

//     // Logged-in user
//     const loggedUUID = decoded.id
//     const user = await User.findById(loggedUUID)
//     if (!user) return res.status(404).json({ message: 'User not found' })

//     const userRole = user.role

//     // Admin can always proceed
//     if (userRole === 'Admin') {
//       req.user = user
//       return next()
//     }

//     // Non-admin must be AssetHolder
//     if (userRole !== 'AssetHolder') {
//       return res
//         .status(403)
//         .json({ message: 'Forbidden: Only AssetHolder allowed' })
//     }

//     // Validate assetType
//     const { assetType } = req.body
//     console.log(assetType)

//     // Extract first word (Property / Car / Boat / Jewelry)
//     const baseType = assetType?.split(' ')[0]

//     if (!assetModels[baseType]) {
//       return res.status(400).json({ message: 'Invalid assetType' })
//     }

//     // All checks passed for creation
//     req.user = user
//     next()
//   } catch (err) {
//     console.error('AssetHolder create middleware error:', err)
//     res.status(500).json({ message: 'Server error in assetHolder middleware' })
//   }
// }
import jwt from 'jsonwebtoken'
import User from '../models/userModel.js'
import Property from '../models/propertyModel.js'
import Car from '../models/carModel.js'
import Boat from '../models/boatModel.js'
import Jewelry from '../models/jewelryModel.js'
import { logSuspiciousActivity } from './logSuspicious.js'

/** Map frontend asset types → backend model keys */
const assetTypeKeyMap = {
  property: 'Property',
  'Property For Sale': 'Property',
  'property for sale': 'Property',

  properties: 'Property',

  car: 'Car',
  cars: 'Car',
  'Car For Sale': 'Car',
  'car for sale': 'Car',


  boat: 'Boat',
  boats: 'Boat',
  'boats for sale': 'Boat',

  jewelry: 'Jewelry',
  jewellery: 'Jewelry',
  'jewellery for sale': 'Jewelry',
  'jewelry for sale': 'Jewelry',
}

/** Actual model references */
const assetModels = {
  Property,
  Car,
  Boat,
  Jewelry,
}

export const assetHolderCreate = async (req, res, next) => {
  try {
    /** 1️⃣ Check Authorization Header */
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await logSuspiciousActivity(req, 'Missing or invalid token')
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No token provided',
      })
    }

    /** 2️⃣ Decode Token */
    const token = authHeader.split(' ')[1]
    let decoded
    try {
      decoded = jwt.verify(token, process.env.SECRET_KEY)
    } catch (err) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token' })
    }

    /** 3️⃣ Get Logged-In User */
    //     // Logged-in user
    const loggedUUID = decoded.id
    const user = await User.findById(loggedUUID, { isDeleted: false })

    if (!user) return res.status(404).json({ message: 'User not found' })

    /** 4️⃣ Role Check */
    if (user.role === 'Admin') {
      req.user = user
      return next()
    }

    if (user.role !== 'AssetHolder') {
      return res.status(403).json({
        message: 'Forbidden: Only AssetHolder allowed',
      })
    }

    // DELETE (and similar) usually has no JSON body; infer model from mounted route, e.g. /api/property → Property.
    if (req.method === 'DELETE') {
      const segments = (req.baseUrl || '').split('/').filter(Boolean)
      let resource = segments[segments.length - 1]?.toLowerCase()
      const pathModelMap = {
        property: 'Property',
        car: 'Car',
        boat: 'Boat',
        jewelry: 'Jewelry',
      }
      if (!pathModelMap[resource]) {
        const m = (req.originalUrl || req.url || '').match(
          /\/(property|car|boat|jewelry)\//i,
        )
        if (m) resource = m[1].toLowerCase()
      }
      const mappedType = pathModelMap[resource]
      if (mappedType && assetModels[mappedType]) {
        req.user = user
        req.assetModel = assetModels[mappedType]
        return next()
      }
    }

    /** 5️⃣ Get and Normalize Asset Type */

    const { assetType } = req.body
    console.log({ assetType })
    if (!assetType)
      return res.status(400).json({ message: 'assetType is required' })

    const normalizedKey = assetType.toLowerCase().trim()
    const mappedType = assetTypeKeyMap[normalizedKey]

    if (!mappedType || !assetModels[mappedType]) {
      return res.status(400).json({
        success: false,
        message: `Invalid assetType: ${assetType}`,
      })
    }

    /** 6️⃣ Pass user + model */
    req.user = user
    req.assetModel = assetModels[mappedType] // <-- usable in controller

    return next()
  } catch (err) {
    console.error('AssetHolder middleware error:', err)
    return res.status(500).json({
      success: false,
      message: 'Server error in assetHolder middleware',
    })
  }
}