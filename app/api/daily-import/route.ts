import { after } from "next/server"
import { NextRequest, NextResponse } from "next/server"
import { profilesFromCatalog, matchesCatalogModel, extractEncarId } from "@/lib/catalog-match"
import { MIN_KRW_FOR_CATALOG } from "@/lib/delivery"
import { searchEncarListings } from "@/lib/encar-list"

export const runtime = "nodejs"
export const maxDuration = 60

const DAILY_TARGET = 100
const CATALOG_API = (process.env.LUXMOTORS_API_URL || "https://luxmotors.kz").replace(/\/$/, "")

type CatalogVehicle = {
  brand?: string
  model?: string
  lotNumber?: string
  vin?: string | null
  createdAt?: string
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

function isTodayAlmaty(iso?: string): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const almaty = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000)
  return almaty.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
}

function cronSecret(): string {
  return process.env.CRON_SECRET || process.env.CALC_IMPORT_SECRET || ""
}

function authorized(req: NextRequest): boolean {
  const secret = cronSecret()
  if (!secret) return process.env.NODE_ENV !== "production"
  const header = req.headers.get("authorization") || ""
  const bearer = header.replace(/^Bearer\s+/i, "").trim()
  const calcHeader = req.headers.get("x-calc-secret") || ""
  const query = req.nextUrl.searchParams.get("secret") || ""
  return bearer === secret || calcHeader === secret || query === secret
}

export async function GET(req: NextRequest) {
  return POST(req)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const batch = Math.min(Math.max(Number(req.nextUrl.searchParams.get("batch")) || 8, 1), 15)
  const depth = Math.max(Number(req.nextUrl.searchParams.get("depth")) || 0, 0)
  const catalog = await fetchCatalog()
  const existingIds = new Set(
    catalog.map((v) => extractEncarId(String(v.lotNumber || ""))).filter(Boolean) as string[]
  )
  const importedToday = catalog.filter((v) => isTodayAlmaty(v.createdAt)).length
  const remainingToday = Math.max(DAILY_TARGET - importedToday, 0)
  if (remainingToday <= 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skipped: 0,
      importedToday,
      remainingToday: 0,
      message: "Дневная квота 100 машин уже набрана",
    })
  }

  const profiles = profilesFromCatalog(catalog)
  if (!profiles.length) {
    return NextResponse.json({ error: "В каталоге нет марок для поиска на Encar" }, { status: 400 })
  }

  const want = Math.min(batch, remainingToday)
  const candidates: string[] = []
  const seen = new Set<string>(existingIds)

  for (let offset = 0; offset < 80 && candidates.length < want * 4; offset += 20) {
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
        if (candidates.length >= want * 4) break
      }
      if (candidates.length >= want * 4) break
    }
  }

  if (candidates.length < want) {
    for (let offset = 0; offset < 40 && candidates.length < want * 3; offset += 20) {
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
          seen.add(hit.id)
          candidates.push(hit.id)
          if (candidates.length >= want * 3) break
        }
        if (candidates.length >= want * 3) break
      }
    }
  }

  const imported: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const origin = req.nextUrl.origin

  for (const id of candidates) {
    if (imported.length >= want) break
    try {
      const res = await fetch(new URL("/api/import-encar", origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.skipped) {
        skipped.push({ id, reason: data.reason || "skipped" })
        continue
      }
      if (!res.ok || data?.error) {
        skipped.push({ id, reason: data?.error || `http_${res.status}` })
        continue
      }
      if (data?.duplicate) {
        skipped.push({ id, reason: "duplicate" })
        continue
      }
      const createdAt = data?.vehicle?.createdAt
      if (createdAt && !isTodayAlmaty(createdAt)) {
        skipped.push({ id, reason: "already_in_catalog" })
        continue
      }
      imported.push(id)
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : "error" })
    }
  }

  const remainingAfter = Math.max(DAILY_TARGET - importedToday - imported.length, 0)
  if (remainingAfter > 0 && imported.length > 0 && depth < 18) {
    const secret = cronSecret()
    const next = new URL("/api/daily-import", origin)
    next.searchParams.set("batch", String(batch))
    next.searchParams.set("depth", String(depth + 1))
    after(async () => {
      await fetch(next, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "X-Calc-Secret": secret,
        },
      }).catch(() => undefined)
    })
  }

  return NextResponse.json({
    ok: true,
    imported: imported.length,
    skipped: skipped.length,
    importedIds: imported,
    skippedItems: skipped.slice(0, 20),
    importedToday: importedToday + imported.length,
    remainingToday: remainingAfter,
    chained: remainingAfter > 0 && imported.length > 0 && depth < 18,
    profiles: profiles.length,
    candidates: candidates.length,
  })
}
