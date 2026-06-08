export function getFullPayDiscountPercent() {
  const raw = Number(process.env.FULL_PAY_DISCOUNT_PERCENT)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return Math.min(50, Math.max(0, raw))
}

export function applyFullPayDiscount(amount) {
  const total = Number(amount)
  if (!Number.isFinite(total) || total <= 0) return { original: total, discounted: total, discountPercent: 0, discountAmount: 0 }

  const discountPercent = getFullPayDiscountPercent()
  if (discountPercent <= 0) {
    return { original: total, discounted: total, discountPercent: 0, discountAmount: 0 }
  }

  const discountAmount = Math.round(total * (discountPercent / 100) * 100) / 100
  const discounted = Math.round((total - discountAmount) * 100) / 100

  return { original: total, discounted, discountPercent, discountAmount }
}
