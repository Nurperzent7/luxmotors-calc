/**
 * Импорт одной машины Encar в каталог, без дневной квоты.
 *   npx tsx scripts/import-one.ts 42356038
 */
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { deliveryUsdByKrw } from "../lib/delivery"
import { fetchEncarVehicleForCalc } from "../lib/encar-vehicle"
import { excludedFuelReason } from "../lib/fuel-filter"
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
const USD_KZT = 467
const KRW_USD = 1380

async function main() {
  const id = String(process.argv[2] || "").trim()
  if (!id || !SECRET) {
    console.error("Usage: npx tsx scripts/import-one.ts <encarId>")
    process.exit(1)
  }

  const car = await fetchEncarVehicleForCalc(id)
  const skip = excludedFuelReason(car.fuel, car.title, car.model, car.brand)
  if (skip) {
    console.error("skipped", skip, car.fuel, car.title)
    process.exit(1)
  }

  const deliveryUsd = deliveryUsdByKrw(car.priceKRW) ?? 0
  const carPriceUsd = Math.round(car.priceKRW / KRW_USD)
  const carPriceKzt = Math.round(carPriceUsd * USD_KZT)
  const logistics = Math.round(deliveryUsd * USD_KZT)
  const almatyTotal = carPriceKzt + logistics
  const classified = classifyFromSavePayload({
    vehicleType: car.vehicleType,
    title: car.title,
    brand: car.brand,
    model: car.model,
    sourceUrl: car.sourceUrl,
    bodyType: car.bodyType,
  })

  const res = await fetch(`${CATALOG_API}/api/vehicles/from-calculator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Calc-Secret": SECRET,
    },
    body: JSON.stringify({
      sourceUrl: car.sourceUrl,
      vin: car.vin,
      title: car.title,
      brand: car.brand,
      model: car.model,
      vehicleType: classified.vehicleType,
      bodyType: car.bodyType || classified.bodyType || null,
      fuel: car.fuel || null,
      transmission: car.transmission || null,
      loadCapacity: car.loadCapacity ?? null,
      year: car.year,
      mileage: car.mileage,
      engine: car.engine,
      engineVolume: `${car.engineLiters}л`,
      priceKRW: car.priceKRW,
      priceKZT: almatyTotal,
      priceDelivery: almatyTotal,
      priceTurnkey: 0,
      imageUrls: car.images,
      bodyDamage: car.bodyDamage,
      insuranceRecords: car.insuranceRecords,
      insuranceSummary: car.insuranceSummary,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(res.status, data)
    process.exit(1)
  }
  console.log("ok", data?.id, data?.brand, data?.model, data?.vehicleType, data?.fuel)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
