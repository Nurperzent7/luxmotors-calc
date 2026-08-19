/**
 * Re-upload catalog photos in Encar code order (001, 002, 003…).
 * Usage: node scripts/sync-encar-photo-order.mjs [--limit=5]
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = (process.env.LUXMOTORS_API_URL || "https://luxmotors.kz").replace(/\/$/, "")
const ENCAR_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://fem.encar.com/",
}

function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local")
  const env = {}
  if (!fs.existsSync(p)) return env
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
  return env
}

function extractId(s) {
  const m = String(s || "").match(/encar\.com\/cars\/detail\/(\d+)/i)
  return m?.[1] || null
}

function photoUrl(p) {
  return `https://ci.encar.com/${String(p || "").replace(/^\//, "")}`
}

function sortEncarPhotos(photos) {
  return (Array.isArray(photos) ? photos : [])
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
    .map((p) => photoUrl(p.path))
    .slice(0, 20)
}

function toRequest(v) {
  const f = v.features || {}
  return {
    vehicleType: v.vehicleType || "CAR",
    brand: v.brand,
    model: v.model,
    trim: v.trim || "",
    year: v.year,
    mileage: v.mileage,
    fuel: v.fuel || "Бензин",
    engine: v.engine || "2.0л",
    transmission: v.transmission || "Автомат",
    drive: v.drive,
    bodyType: v.bodyType,
    color: v.color,
    engineVolume: v.engineVolume,
    steeringWheel: v.steeringWheel,
    vin: v.vin,
    lotNumber: v.lotNumber,
    badge: v.badge,
    customsCleared: Boolean(v.customsCleared),
    damaged: Boolean(v.damaged),
    hasHistory: Boolean(v.hasHistory),
    motorHours: v.motorHours,
    loadCapacity: v.loadCapacity,
    priceKRW: v.priceKRW,
    priceKZT: v.priceKZT,
    priceDelivery: v.priceDelivery,
    priceTurnkey: v.priceTurnkey,
    priceDescription: v.priceDescription,
    registrationFeeKZT: v.registrationFeeKZT,
    recyclingFeeKZT: v.recyclingFeeKZT,
    customsDutyKZT: v.customsDutyKZT,
    commission: v.commission,
    verified: Boolean(v.verified),
    published: v.published !== false,
    featuresComfort: f.comfort || [],
    featuresInterior: f.interior || [],
    featuresSafety: f.safety || [],
    featuresElectronics: f.electronics || [],
    featuresAssistance: f.assistance || [],
    inspection: v.inspection && typeof v.inspection === "object" && Object.keys(v.inspection).some((k) => v.inspection[k])
      ? v.inspection
      : undefined,
    bodyDamage: Array.isArray(v.bodyDamage) && v.bodyDamage.length ? v.bodyDamage : undefined,
  }
}

async function fetchCatalog() {
  const all = []
  for (let page = 0; page < 40; page++) {
    const res = await fetch(`${API}/api/vehicles?page=${page}&size=100`)
    if (!res.ok) break
    const data = await res.json()
    const chunk = Array.isArray(data?.content) ? data.content : []
    all.push(...chunk)
    if (chunk.length < 100 || data?.last) break
  }
  return all
}

async function downloadImages(urls) {
  const files = []
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], { headers: ENCAR_HEADERS })
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1000) continue
    files.push({ name: `encar-${String(i + 1).padStart(3, "0")}.jpg`, buf })
  }
  return files
}

async function main() {
  const env = loadEnv()
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0
  const email = process.env.LUX_ADMIN_EMAIL || env.LUX_ADMIN_EMAIL || "admin@luxmotors.kz"
  const password = process.env.LUX_ADMIN_PASSWORD || env.LUX_ADMIN_PASSWORD || env.ADMIN_PASSWORD || "admin123"

  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const loginData = await loginRes.json().catch(() => ({}))
  if (!loginRes.ok || !loginData?.token) {
    console.error("LOGIN_FAILED", loginRes.status)
    process.exit(1)
  }
  const token = loginData.token
  console.log("LOGIN_OK")

  const catalog = await fetchCatalog()
  const targets = catalog.filter((v) => extractId(v.lotNumber))
  const work = limit > 0 ? targets.slice(0, limit) : targets
  console.log(`CATALOG=${catalog.length} ENCAR=${targets.length} WORK=${work.length}`)

  let ok = 0
  let fail = 0
  for (const card of work) {
    const encarId = extractId(card.lotNumber)
    try {
      const detailRes = await fetch(`${API}/api/vehicles/${card.id}`)
      const vehicle = await detailRes.json()
      const encarRes = await fetch(`https://api.encar.com/v1/readside/vehicle/${encarId}`, {
        headers: { ...ENCAR_HEADERS, Referer: `https://fem.encar.com/cars/detail/${encarId}` },
      })
      if (!encarRes.ok) throw new Error(`encar_${encarRes.status}`)
      const encar = await encarRes.json()
      const urls = sortEncarPhotos(encar.photos)
      if (!urls.length) throw new Error("no_photos")
      const files = await downloadImages(urls)
      if (!files.length) throw new Error("download_failed")

      const form = new FormData()
      form.append("data", new Blob([JSON.stringify(toRequest(vehicle))], { type: "application/json" }))
      for (const file of files) {
        form.append("images", new Blob([file.buf], { type: "image/jpeg" }), file.name)
      }
      const put = await fetch(`${API}/api/vehicles/${card.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!put.ok) throw new Error(`put_${put.status}`)
      ok += 1
      console.log(`OK ${card.id} ${encarId} photos=${files.length}`)
    } catch (e) {
      fail += 1
      console.log(`FAIL ${card.id} ${encarId} ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`DONE ok=${ok} fail=${fail}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
