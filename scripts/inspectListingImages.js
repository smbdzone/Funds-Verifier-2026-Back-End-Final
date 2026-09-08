import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Property from '../models/propertyModel.js'
import DeveloperUnit from '../models/developerUnitModel.js'
import DeveloperMedia from '../models/developerMediaModel.js'
import DeveloperProject from '../models/developerProjectModel.js'

dotenv.config()
await mongoose.connect(process.env.DBURL)

const props = await Property.find({
  assetType: 'Property Off Plan For Sale',
  isDeleted: { $ne: true },
  title: /Marina Height/i,
})
  .select('title images image imageAsset media gallery')
  .lean()

for (const p of props) {
  const keys = Object.keys(p)
  console.log('\n=== PROPERTY', p.title, p._id)
  console.log('keys:', keys.join(', '))
  // Dump image-related fields with counts
  for (const k of ['images', 'image', 'imageAsset', 'media', 'gallery']) {
    const v = p[k]
    if (v === undefined) continue
    if (Array.isArray(v)) {
      console.log(k, 'array length', v.length)
      console.log(JSON.stringify(v, null, 2).slice(0, 3000))
    } else if (v && typeof v === 'object') {
      console.log(k, 'object keys', Object.keys(v))
      // common shapes
      if (Array.isArray(v.images)) console.log(k + '.images length', v.images.length)
      if (Array.isArray(v.urls)) console.log(k + '.urls length', v.urls.length)
      if (Array.isArray(v.items)) console.log(k + '.items length', v.items.length)
      console.log(JSON.stringify(v, null, 2).slice(0, 4000))
    } else {
      console.log(k, v)
    }
  }
}

const projects = await DeveloperProject.find({ name: /Marina|Residence|Burj/i, isDeleted: { $ne: true } })
  .select('name')
  .lean()
console.log('\n=== PROJECTS', projects)

const allProjects = await DeveloperProject.find({ isDeleted: { $ne: true } }).select('name').lean()
console.log('ALL PROJECTS', allProjects)

for (const proj of allProjects) {
  const media = await DeveloperMedia.find({ project: proj._id, isDeleted: { $ne: true } })
    .select('type kind category url fileUrl path key mimeType createdAt unit')
    .lean()
  console.log(`\n=== MEDIA for ${proj.name} (${proj._id}) count=${media.length}`)
  console.log(JSON.stringify(media, null, 2).slice(0, 5000))
}

const units = await DeveloperUnit.find({ isDeleted: { $ne: true }, publishedPropertyId: { $ne: null } })
  .select('unitNumber title publishedPropertyId project')
  .lean()
console.log('\n=== PUBLISHED UNITS', JSON.stringify(units, null, 2))

await mongoose.disconnect()
