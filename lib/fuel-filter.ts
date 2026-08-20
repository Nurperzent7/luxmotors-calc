const ELECTRIC_MODEL_RE =
  /\b(ev[0-9]{1,2}\b|e-tron|etron|ioniq\s*[56]\b|niro\s*ev|kona\s*electric|bolt\s*ev|model\s*[3syx]\b|leaf\b|id\.?\s*4|id\.?\s*5|taycan|eq[esbc]\d|i[x34578]\b|ix\d|bmw\s*i\d|테슬라|전기차|전기)\b/i

const DIESEL_TEXT_RE = /디젤|diesel|дизел/i
const ELECTRIC_TEXT_RE = /전기|electric|электр/i

/** Бензин и гибриды — да; дизель и чистый электро — нет. */
export function isAllowedCatalogFuel(
  fuel?: string | null,
  ...textParts: Array<string | null | undefined>
): boolean {
  const fuelNorm = String(fuel || "").trim().toLowerCase()
  if (fuelNorm.includes("дизел") || fuelNorm.includes("diesel")) return false
  if (fuelNorm.includes("элект") || fuelNorm.includes("electric")) return false

  const blob = textParts.map((p) => String(p || "")).join(" ")
  if (DIESEL_TEXT_RE.test(blob)) return false

  // Гибрид (RX450h, ES300h) — оставляем; чистый EV — нет
  const isHybrid =
    /hybrid|하이브리드|гибрид/i.test(blob) ||
    /\b\w+\d*h\b/i.test(blob) ||
    fuelNorm.includes("гибрид")

  if (!isHybrid && (ELECTRIC_TEXT_RE.test(blob) || ELECTRIC_MODEL_RE.test(blob))) {
    return false
  }

  if (/\btesla\b/i.test(blob)) return false

  return true
}

export function excludedFuelReason(
  fuel?: string | null,
  ...textParts: Array<string | null | undefined>
): string | null {
  return isAllowedCatalogFuel(fuel, ...textParts) ? null : "excluded_fuel"
}
