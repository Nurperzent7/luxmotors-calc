export function calculatePriceByYear(
    basePrice: number,
    baseYear: number,
    targetYear: number
  ) {
    const yearsDiff = baseYear - targetYear
  
    return Math.round(
      basePrice * Math.pow(0.85, yearsDiff)
    )
  }