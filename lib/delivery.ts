/** Доставка до Алматы ($) по цене авто в KRW. Ниже 5 млн вон в каталог не берём. */
export const MIN_KRW_FOR_CATALOG = 5_000_000
export const KRW_TIER_30M = 30_000_000
export const KRW_TIER_40M = 40_000_000
export const DELIVERY_BY_AGREEMENT = "По договоренности"

export function deliveryUsdByKrw(priceKRW: number): number | null {
  const n = Number(priceKRW) || 0
  if (n < MIN_KRW_FOR_CATALOG) return null
  if (n < KRW_TIER_30M) return 1650
  if (n < KRW_TIER_40M) return 1000
  return 0
}

export function isDeliveryByAgreement(priceKRW: number): boolean {
  return deliveryUsdByKrw(priceKRW) === 0
}

export function deliveryLabel(priceKRW: number): string {
  const usd = deliveryUsdByKrw(priceKRW)
  if (usd === null) return "ниже 5 млн ₩ — не в каталог"
  if (usd === 0) return DELIVERY_BY_AGREEMENT
  return `доставка $${usd}`
}

export function logisticsDescriptionLine(priceKRW: number, logisticsKzt: number): string | null {
  if (isDeliveryByAgreement(priceKRW)) return `Логистика: ${DELIVERY_BY_AGREEMENT}`
  if (logisticsKzt) return `Логистика: ${new Intl.NumberFormat("ru-RU").format(logisticsKzt)} ₸`
  return null
}
