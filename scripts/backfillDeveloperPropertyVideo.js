import dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config()

/**
 * Copy DeveloperUnit.video → Property.video when the marketplace property
 * is missing video after publish.
 */
async function main() {
  const uri = String(process.env.DBURL || '').trim()
  if (!uri) throw new Error('DBURL missing')
  await mongoose.connect(uri)

  const units = await mongoose.connection
    .collection('developerunits')
    .find({
      isDeleted: { $ne: true },
      publishedPropertyId: { $ne: null },
      video: { $ne: null },
    })
    .project({ _id: 1, video: 1, publishedPropertyId: 1, title: 1, uuid: 1 })
    .toArray()

  let updated = 0
  let skipped = 0

  for (const unit of units) {
    const property = await mongoose.connection
      .collection('properties')
      .findOne(
        { _id: unit.publishedPropertyId },
        { projection: { video: 1, title: 1, uuid: 1 } },
      )
    if (!property) {
      skipped += 1
      continue
    }
    if (property.video) {
      skipped += 1
      continue
    }
    await mongoose.connection.collection('properties').updateOne(
      { _id: property._id },
      { $set: { video: unit.video } },
    )
    updated += 1
    console.log('updated', property.uuid || property._id, unit.title || unit.uuid)
  }

  console.log(JSON.stringify({ units: units.length, updated, skipped }))
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  try {
    await mongoose.disconnect()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
