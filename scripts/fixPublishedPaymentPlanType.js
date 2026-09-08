import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Property from '../models/propertyModel.js'
import DeveloperUnit from '../models/developerUnitModel.js'
import DeveloperPaymentPlan from '../models/developerPaymentPlanModel.js'

dotenv.config()

const uri = process.env.DBURL
if (!uri) {
  console.error('No DBURL')
  process.exit(1)
}

await mongoose.connect(uri)

const props = await Property.find({
  assetType: 'Property Off Plan For Sale',
  isDeleted: { $ne: true },
  title: /Marina Height/i,
})
  .select('title paymentPlanType slug')
  .lean()
console.log('PROPERTIES', JSON.stringify(props, null, 2))

const plans = await DeveloperPaymentPlan.find({ isDeleted: { $ne: true } })
  .select('name downPaymentPercent constructionPercent postHandoverPercent project milestones')
  .lean()
console.log('PLANS', JSON.stringify(plans, null, 2))

// Fix: set paymentPlanType from plan.name for published developer units
const units = await DeveloperUnit.find({
  isDeleted: { $ne: true },
  publishedPropertyId: { $ne: null },
})
  .populate({ path: 'paymentPlan', select: 'name downPaymentPercent constructionPercent postHandoverPercent milestones' })
  .lean()

let fixed = 0
for (const unit of units) {
  let plan = unit.paymentPlan
  if (!plan) {
    plan = await DeveloperPaymentPlan.findOne({
      project: unit.project,
      isDeleted: { $ne: true },
    })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean()
  }
  if (!plan) continue

  const name = String(plan.name || '').trim()
  const looksLikeRatio = /^\d{1,3}\/\d{1,3}(\/\d{1,3})?$/.test(name)
  if (!looksLikeRatio) continue

  const paymentPlan = (plan.milestones || []).map((m, index, arr) => {
    const title =
      String(m.label || '').trim() ||
      String(m.dueLabel || '').trim() ||
      (index === 0
        ? 'Down Payment'
        : index === arr.length - 1
          ? 'Final Payment'
          : 'Payment Share')
    return {
      step: index + 1,
      stepLabel: `Step ${index + 1}`,
      paymentLabel: title,
      sharePercent: String(m.percent ?? ''),
      milestone: title,
    }
  })

  const updated = await Property.findByIdAndUpdate(
    unit.publishedPropertyId,
    { $set: { paymentPlanType: name, paymentPlan } },
    { new: true },
  ).select('title paymentPlanType')

  if (updated) {
    fixed += 1
    console.log('FIXED', updated.title, '=>', updated.paymentPlanType)
  }
}

console.log('Fixed count:', fixed)
await mongoose.disconnect()
