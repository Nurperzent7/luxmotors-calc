import { extractEncarVehicleId, fetchEncarBodyDamage, fetchEncarInsuranceHistory } from "@/lib/encar-inspection"

const ENCAR_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://fem.encar.com/",
}

export type EncarCalcVehicle = {
  sourceUrl: string
  vin: string | null
  title: string
  brand: string
  model: string
  year: number
  mileage: number
  engine: string
  engineLiters: string
  priceKRW: number
  images: string[]
  bodyDamage: Array<{ part: string; status: string; code?: string; layer?: string }>
  insuranceRecords: Array<{ date: string; type: string; amount: number; description: string }>
  insuranceSummary: Record<string, unknown> | null
}

function photoUrl(path: string): string {
  const p = String(path || "").replace(/^\//, "")
  return `https://ci.encar.com/${p}`
}

/** Encar API отдаёт photos вперемешку; на сайте они идут по коду 001, 002, 003… */
export function sortEncarPhotoUrls(
  photos: Array<{ path?: string; code?: string | number }>
): string[] {
  return photos
    .filter((p) => p?.path)
    .slice()
    .sort((a, b) => {
      const na = Number(String(a.code ?? "").replace(/\D/g, ""))
      const nb = Number(String(b.code ?? "").replace(/\D/g, ""))
      const ca = Number.isFinite(na) && String(a.code ?? "").trim() !== "" ? na : 9999
      const cb = Number.isFinite(nb) && String(b.code ?? "").trim() !== "" ? nb : 9999
      if (ca !== cb) return ca - cb
      return String(a.path).localeCompare(String(b.path || ""))
    })
    .map((p) => photoUrl(String(p.path)))
    .filter(Boolean)
    .slice(0, 20)
}

function yearFromEncar(yearMonth: unknown, formYear: unknown): number {
  const form = Number(String(formYear || "").slice(0, 4))
  if (form >= 1990 && form <= 2100) return form
  const ym = Number(yearMonth)
  if (Number.isFinite(ym) && ym >= 199001) return Math.floor(ym / 100)
  return new Date().getFullYear()
}

export async function fetchEncarVehicleForCalc(vehicleId: string): Promise<EncarCalcVehicle> {
  const id = extractEncarVehicleId(vehicleId) || String(vehicleId).replace(/\D/g, "")
  if (!id) throw new Error("Нет ID объявления Encar")

  const res = await fetch(`https://api.encar.com/v1/readside/vehicle/${id}`, {
    headers: { ...ENCAR_HEADERS, Referer: `https://fem.encar.com/cars/detail/${id}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Encar API ${res.status}`)
  const veh = await res.json()

  const brand =
    String(veh?.category?.manufacturerEnglishName || "").trim() ||
    String(veh?.category?.manufacturerName || "").trim() ||
    "Unknown"
  const modelParts = [
    veh?.category?.modelGroupEnglishName || veh?.category?.modelGroupName,
    veh?.category?.modelEnglishName || veh?.category?.modelName,
    veh?.category?.gradeEnglishName || veh?.category?.gradeName,
    veh?.category?.gradeDetailEnglishName || veh?.category?.gradeDetailName,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
  const model = [...new Set(modelParts)].join(" ").trim() || "Unknown"
  const title = `${brand} ${model}`.replace(/\s+/g, " ").trim()

  const displacement = Number(veh?.spec?.displacement) || 0
  const liters = displacement > 0 ? (displacement / 1000).toFixed(1) : "2.0"
  const priceMan = Number(veh?.advertisement?.price) || 0
  const photos = Array.isArray(veh?.photos) ? veh.photos : []
  const images = sortEncarPhotoUrls(photos)

  let bodyDamage: EncarCalcVehicle["bodyDamage"] = []
  let insuranceRecords: EncarCalcVehicle["insuranceRecords"] = []
  let insuranceSummary: Record<string, unknown> | null = null
  try {
    const insp = await fetchEncarBodyDamage(id)
    bodyDamage = insp.bodyDamage
  } catch {
    /* optional */
  }
  try {
    const hist = await fetchEncarInsuranceHistory(id)
    insuranceRecords = hist.insuranceRecords
    insuranceSummary = hist.insuranceSummary as Record<string, unknown>
  } catch {
    /* optional */
  }

  return {
    sourceUrl: `https://fem.encar.com/cars/detail/${id}`,
    vin: String(veh?.vin || "").trim() || null,
    title,
    brand,
    model,
    year: yearFromEncar(veh?.category?.yearMonth, veh?.category?.formYear),
    mileage: Number(veh?.spec?.mileage) || 0,
    engine: `${liters} л`,
    engineLiters: liters,
    priceKRW: Math.round(priceMan * 10000),
    images,
    bodyDamage,
    insuranceRecords,
    insuranceSummary,
  }
}
