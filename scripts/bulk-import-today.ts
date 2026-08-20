/**
 * Разовая выгрузка до 100 машин в каталог luxmotors.kz (минуя Vercel cron).
 * CRON_SECRET / CALC_IMPORT_SECRET берётся из .env.local или окружения.
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { profilesFromCatalog, matchesCatalogModel, extractEncarId } from "../lib/catalog-match"
import { MIN_KRW_FOR_CATALOG } from "../lib/delivery"
import { searchEncarListings } from "../lib/encar-list"
import { fetchEncarVehicleForCalc } from "../lib/encar-vehicle"
import { excludedFuelReason } from "../lib/fuel-filter"
import { deliveryUsdByKrw } from "../lib/delivery"
import { classifyFromSavePayload } from "../lib/special-vehicle"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const key = m[1]
    if (key === "LUXMOTORS_API_URL") continue
    if (!process.env[key]) process.env[key] = m[2].replace(/^"|"$/g, "")
  }
}

const CATALOG_API = (process.env.LUXMOTORS_IMPORT_TARGET || "https://luxmotors.kz").replace(/\/$/, "")
const SECRET = process.env.CRON_SECRET || process.env.CALC_IMPORT_SECRET || ""
const DAILY_TARGET = 100
const USD_KZT = 467
const KRW_USD = 1380

type CatalogVehicle = {
  brand?: string
  model?: string
  lotNumber?: string
  createdAt?: string
}

function isTodayAlmaty(iso?: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const almaty = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000)
  return almaty.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
}

async function fetchCatalog(): Promise<CatalogVehicle[]> {
  const all: CatalogVehicle[] = []
  for (let page = 0; page < 30; page++) {
    const res = await fetch(`${CATALOG_API}/api/vehicles?page=${page}&size=100`, { cache: "no-store" })
    if (!res.ok) break
    const data = await res.json()
    const chunk = Array.isArray(data?.content) ? data.content : []
    all.push(...chunk)
    if (chunk.length < 100 || data?.last) break
  }
  return all
}

async function saveToCatalog(body: Record<string, unknown>) {
  const classified = classifyFromSavePayload({
    vehicleType: body.vehicleType as string | undefined,
    title: String(body.title || ""),
    brand: String(body.brand || ""),
    model: String(body.model || ""),
    sourceUrl: String(body.sourceUrl || ""),
    bodyType: body.bodyType as string | undefined,
  })

  const payload = {
    sourceUrl: body.sourceUrl,
    vin: body.vin ?? null,
    title: body.title,
    brand: body.brand,
    model: body.model,
    vehicleType: classified.vehicleType,
    bodyType: body.bodyType || classified.bodyType || null,
    fuel: body.fuel || null,
    transmission: body.transmission || null,
    loadCapacity: body.loadCapacity ?? null,
    year: body.year,
    mileage: body.mileage,
    engine: body.selectedEngine || body.engine,
    engineVolume: String(body.selectedEngine || "2.0").replace(/\s*л\s*$/i, "") + "л",
    priceKRW: body.priceKRW,
    priceKZT: body.priceDelivery,
    priceDelivery: body.priceDelivery,
    priceTurnkey: 0,
    imageUrls: body.images,
    bodyDamage: body.bodyDamage || [],
    insuranceRecords: body.insuranceRecords || [],
    insuranceSummary: body.insuranceSummary || null,
  }

  const res = await fetch(`${CATALOG_API}/api/vehicles/from-calculator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Calc-Secret": SECRET,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data
}

async function importOne(id: string, existingIds: Set<string>): Promise<"imported" | "skipped" | "duplicate"> {
  if (existingIds.has(id)) return "duplicate"

  const car = await fetchEncarVehicleForCalc(id)
  if (excludedFuelReason(car.fuel, car.title, car.model, car.brand)) return "skipped"

  const deliveryUsd = deliveryUsdByKrw(car.priceKRW)
  if (deliveryUsd === null) return "skipped"

  const carPriceUsd = Math.round(car.priceKRW / KRW_USD)
  const carPriceKzt = Math.round(carPriceUsd * USD_KZT)
  const logistics = Math.round(deliveryUsd * USD_KZT)
  const almatyTotal = carPriceKzt + logistics

  await saveToCatalog({
    sourceUrl: car.sourceUrl,
    vin: car.vin,
    title: car.title,
    brand: car.brand,
    model: car.model,
    year: car.year,
    mileage: car.mileage,
    priceKRW: car.priceKRW,
    images: car.images,
    selectedEngine: car.engine,
    priceDelivery: almatyTotal,
    bodyDamage: car.bodyDamage,
    insuranceRecords: car.insuranceRecords,
    insuranceSummary: car.insuranceSummary,
    vehicleType: car.vehicleType,
    bodyType: car.bodyType,
    fuel: car.fuel,
    transmission: car.transmission,
    loadCapacity: car.loadCapacity,
  })

  existingIds.add(id)
  return "imported"
}

async function main() {
  if (!SECRET) {
    console.error("Set CRON_SECRET or CALC_IMPORT_SECRET")
    process.exit(1)
  }

  const catalog = await fetchCatalog()
  const existingIds = new Set(
    catalog.map((v) => extractEncarId(String(v.lotNumber || ""))).filter(Boolean) as string[]
  )
  const importedToday = catalog.filter((v) => isTodayAlmaty(v.createdAt)).length
  let remaining = Math.max(DAILY_TARGET - importedToday, 0)
  console.log(`catalog=${catalog.length}, today=${importedToday}, remaining=${remaining}`)
  if (remaining <= 0) return

  const profiles = profilesFromCatalog(catalog)
  const candidates: string[] = []
  const seen = new Set(existingIds)

  for (let offset = 0; offset < 200 && candidates.length < remaining * 12; offset += 20) {
    for (const profile of profiles) {
      const hits = await searchEncarListings({
        manufacturerKo: profile.koManufacturer,
        carType: profile.carType,
        offset,
        limit: 20,
      })
      for (const hit of hits) {
        if (seen.has(hit.id)) continue
        if (hit.priceKRW < MIN_KRW_FOR_CATALOG) continue
        if (!matchesCatalogModel(hit.model, profile.family)) continue
        seen.add(hit.id)
        candidates.push(hit.id)
      }
    }
  }

  console.log(`candidates=${candidates.length}`)
  let imported = 0
  let skipped = 0

  for (const id of candidates) {
    if (imported >= remaining) break
    try {
      const result = await importOne(id, existingIds)
      if (result === "imported") {
        imported++
        if (imported % 5 === 0) console.log(`progress: ${imported}/${remaining}`)
      } else {
        skipped++
      }
    } catch (e) {
      skipped++
      console.warn(`fail ${id}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`done: imported=${imported}, skipped=${skipped}, today=${importedToday + imported}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
