export function extractEncarId(value: string): string | null {
  const src = String(value || "")
  const m =
    src.match(/encar\.com\/cars\/detail\/(\d+)/i) ||
    src.match(/encar\.com\/cars\/report\/inspect\/(\d+)/i) ||
    src.match(/[?&]carid=(\d+)/i) ||
    src.match(/^(\d{6,})$/)
  return m?.[1] || null
}

export function canonicalEncarUrl(idOrUrl: string): string | null {
  const id = extractEncarId(idOrUrl)
  return id ? `https://fem.encar.com/cars/detail/${id}` : null
}

export const ENCAR_MANUFACTURER: Record<string, { ko: string; carType: "Y" | "N" }> = {
  hyundai: { ko: "현대", carType: "Y" },
  kia: { ko: "기아", carType: "Y" },
  genesis: { ko: "제네시스", carType: "Y" },
  chevrolet: { ko: "쉐보레", carType: "Y" },
  ssangyong: { ko: "KG모빌리티", carType: "Y" },
  "kg mobility": { ko: "KG모빌리티", carType: "Y" },
  "renault korea": { ko: "르노코리아", carType: "Y" },
  lexus: { ko: "렉서스", carType: "N" },
  toyota: { ko: "토요타", carType: "N" },
  bmw: { ko: "BMW", carType: "N" },
  "mercedes-benz": { ko: "벤츠", carType: "N" },
  mercedes: { ko: "벤츠", carType: "N" },
  audi: { ko: "아우디", carType: "N" },
  volkswagen: { ko: "폭스바겐", carType: "N" },
  volvo: { ko: "볼보", carType: "N" },
  porsche: { ko: "포르쉐", carType: "N" },
  "land rover": { ko: "랜드로버", carType: "N" },
  mini: { ko: "미니", carType: "N" },
  honda: { ko: "혼다", carType: "N" },
  nissan: { ko: "닛산", carType: "N" },
  infiniti: { ko: "인피니티", carType: "N" },
  mazda: { ko: "마쓰다", carType: "N" },
  subaru: { ko: "스바루", carType: "N" },
  jeep: { ko: "지프", carType: "N" },
  ford: { ko: "포드", carType: "N" },
  tesla: { ko: "테슬라", carType: "N" },
  bentley: { ko: "벤틀리", carType: "N" },
  jaguar: { ko: "재규어", carType: "N" },
  cadillac: { ko: "캐딜락", carType: "N" },
  maserati: { ko: "마세라티", carType: "N" },
}

const MODEL_FAMILIES = [
  "SANTA FE", "RANGE ROVER", "GRAND CHEROKEE",
  "PALISADE", "CARNIVAL", "GRANDEUR", "TUCSON", "SORENTO", "SPORTAGE",
  "STARIA", "IONIQ", "SONATA", "KONA",
  "GV80", "GV70", "G90", "G80",
  "EV9", "EV6", "K8", "K5",
  "RX", "ES", "NX", "LX", "LS", "GX", "UX",
  "X7", "X6", "X5", "X4", "X3", "X1",
  "S-CLASS", "E-CLASS", "C-CLASS", "G-CLASS", "GLE", "GLC", "GLS",
  "Q8", "Q7", "Q5", "A6", "A4",
  "CAYENNE", "MACAN", "PANAMERA",
].sort((a, b) => b.length - a.length)

export function modelFamily(model: string): string {
  const compact = String(model || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const nospace = compact.replace(/\s+/g, "")
  for (const fam of MODEL_FAMILIES) {
    const f = fam.replace(/\s+/g, "")
    if (nospace.includes(f) || compact.includes(fam)) return fam
  }
  const token = compact.match(/[A-Z][A-Z0-9]{1,}/)
  return token?.[0] || compact.slice(0, 16)
}

export function matchesCatalogModel(encarModel: string, family: string): boolean {
  const hay = String(encarModel || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const needle = family.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!hay || !needle) return false
  return hay.includes(needle) || needle.includes(hay.slice(0, needle.length))
}

export type CatalogProfile = {
  brand: string
  family: string
  koManufacturer: string
  carType: "Y" | "N"
}

export function profilesFromCatalog(
  vehicles: Array<{ brand?: string; model?: string }>
): CatalogProfile[] {
  const seen = new Set<string>()
  const out: CatalogProfile[] = []
  for (const v of vehicles) {
    const brand = String(v.brand || "").trim()
    if (!brand) continue
    const meta = ENCAR_MANUFACTURER[brand.toLowerCase()]
    if (!meta) continue
    const family = modelFamily(String(v.model || ""))
    const key = `${meta.ko}::${family}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      brand,
      family,
      koManufacturer: meta.ko,
      carType: meta.carType,
    })
  }
  return out
}
