import { resolveFullPayDiscountPercent } from '../controller/successFeeCtrl.js'

export async function getFullPayDiscountPercent() {
  return resolveFullPayDiscountPercent()
}

export async function applyFullPayDiscount(amount) {
  const total = Number(amount)
  if (!Number.isFinite(total) || total <= 0) {
    return { original: total, discounted: total, discountPercent: 0, discountAmount: 0 }
  }

  const discountPercent = await getFullPayDiscountPercent()
  if (discountPercent <= 0) {
    return { original: total, discounted: total, discountPercent: 0, discountAmount: 0 }
  }

  const discountAmount = Math.round(total * (discountPercent / 100) * 100) / 100
  const discounted = Math.round((total - discountAmount) * 100) / 100

  return { original: total, discounted, discountPercent, discountAmount }
}
