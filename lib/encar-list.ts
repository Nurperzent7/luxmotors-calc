const ENCAR_HEADERS = {
  Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://fem.encar.com/",
  Origin: "https://fem.encar.com",
}

export function extractEncarVehicleIds(text: string): string[] {
  const ids = new Set<string>()
  const src = String(text || "")
  for (const re of [
    /encar\.com\/cars\/detail\/(\d+)/gi,
    /encar\.com\/cars\/report\/inspect\/(\d+)/gi,
    /[?&]carid=(\d+)/gi,
  ]) {
    for (const m of src.matchAll(re)) {
      if (m[1]) ids.add(m[1])
    }
  }
  return [...ids]
}

export function isEncarDetailUrl(url: string): boolean {
  const u = String(url || "")
  return (
    /encar\.com\/cars\/detail\/\d+/i.test(u) ||
    /encar\.com\/cars\/report\/inspect\/\d+/i.test(u)
  )
}

export function isEncarSearchUrl(url: string): boolean {
  const u = String(url || "").toLowerCase()
  if (!u.includes("encar.com")) return false
  // Listing clicks add pageid=fc_carsearch to detail URLs — not a search page
  if (isEncarDetailUrl(url)) return false
  return (
    u.includes("/cars/search") ||
    u.includes("carsearchlist") ||
    u.includes("/cars/list") ||
    u.includes("fc_carsearch") ||
    u.includes("dc_carsearch")
  )
}

function extractEncarQuery(url: string): string | null {
  try {
    const parsed = new URL(url)
    const q = parsed.searchParams.get("q")
    if (q && q.includes("And.")) return q
  } catch {
    /* ignore */
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(url)
    } catch {
      return url
    }
  })()
  const match = decoded.match(/(\(And\.[^\n]{8,400}\))/)
  return match?.[1] || null
}

async function idsFromSearchApi(query: string, limit: number): Promise<string[]> {
  const sr = encodeURIComponent(`|ModifiedDate|0|${limit}`)
  const apiUrl =
    `https://api.encar.com/search/car/list/general?count=false` +
    `&q=${encodeURIComponent(query)}&sr=${sr}`
  const res = await fetch(apiUrl, { headers: ENCAR_HEADERS, cache: "no-store" })
  if (!res.ok) return []
  const data = (await res.json()) as { SearchResults?: Array<{ Id?: string | number }> }
  const ids = (data.SearchResults || [])
    .map((row) => String(row?.Id || "").trim())
    .filter((id) => /^\d{6,}$/.test(id))
  return [...new Set(ids)].slice(0, limit)
}

async function idsFromPageHtml(url: string, limit: number): Promise<string[]> {
  const res = await fetch(url, { headers: ENCAR_HEADERS, cache: "no-store" })
  if (!res.ok) return []
  const html = await res.text()
  return extractEncarVehicleIds(html).slice(0, limit)
}

export type EncarSearchHit = {
  id: string
  manufacturer: string
  model: string
  priceMan: number
  priceKRW: number
}

export async function searchEncarListings(opts: {
  manufacturerKo: string
  carType: "Y" | "N"
  offset?: number
  limit?: number
}): Promise<EncarSearchHit[]> {
  const limit = Math.min(Math.max(opts.limit || 20, 1), 40)
  const offset = Math.max(opts.offset || 0, 0)
  const q = `(And.Hidden.N._.CarType.${opts.carType}._.Manufacturer.${opts.manufacturerKo}.)`
  const sr = encodeURIComponent(`|ModifiedDate|${offset}|${limit}`)
  const apiUrl =
    `https://api.encar.com/search/car/list/general?count=false` +
    `&q=${encodeURIComponent(q)}&sr=${sr}`
  const res = await fetch(apiUrl, { headers: ENCAR_HEADERS, cache: "no-store" })
  if (!res.ok) return []
  const data = (await res.json()) as {
    SearchResults?: Array<{
      Id?: string | number
      Manufacturer?: string
      Model?: string
      Price?: number
    }>
  }
  return (data.SearchResults || [])
    .map((row) => {
      const id = String(row?.Id || "").trim()
      const priceMan = Number(row?.Price) || 0
      return {
        id,
        manufacturer: String(row?.Manufacturer || ""),
        model: String(row?.Model || ""),
        priceMan,
        priceKRW: Math.round(priceMan * 10000),
      }
    })
    .filter((row) => /^\d{6,}$/.test(row.id))
}

export async function resolveEncarVehicleIds(
  input: string,
  limit = 10
): Promise<{ ids: string[]; query: string | null }> {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30)
  const fromText = extractEncarVehicleIds(input)
  if (fromText.length > 0 && (isEncarDetailUrl(input) || !isEncarSearchUrl(input))) {
    return { ids: fromText.slice(0, safeLimit), query: null }
  }

  const query = extractEncarQuery(input)
  if (query) {
    const ids = await idsFromSearchApi(query, safeLimit)
    if (ids.length) return { ids, query }
  }

  if (isEncarSearchUrl(input)) {
    const first = input.trim().split(/\s+/)[0]
    const ids = await idsFromPageHtml(first, safeLimit)
    if (ids.length) return { ids, query }
  }

  return { ids: fromText.slice(0, safeLimit), query }
}
