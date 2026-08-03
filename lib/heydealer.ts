const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type HeyDealerParsed = {
  title: string
  year: number
  mileage: string
  krw: number
  images: string[]
  source: "heydealer"
}

export function isHeyDealerUrl(url: string): boolean {
  const value = url.trim()
  if (value.startsWith("heydealer://")) return true

  try {
    return new URL(value).hostname.toLowerCase().includes("heydealer.com")
  } catch {
    return false
  }
}

export function extractHeyDealerHashId(url: string): {
  hashId: string
  kind: "market" | "dealer"
} | null {
  const value = url.trim()

  const deepLinkMatch = value.match(
    /heydealer:\/\/(?:market\/)?cars\/([^/?#]+)/i
  )
  if (deepLinkMatch?.[1]) {
    return {
      hashId: deepLinkMatch[1],
      kind: value.includes("market/") ? "market" : "dealer",
    }
  }

  try {
    const parsed = new URL(value)
    const match = parsed.pathname.match(/\/(?:market\/cars|cars)\/([^/?#]+)/i)
    if (!match?.[1]) return null

    const host = parsed.hostname.toLowerCase()
    return {
      hashId: match[1],
      kind: host.startsWith("dealer.") ? "dealer" : "market",
    }
  } catch {
    return null
  }
}

function buildTitle(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function parseYear(value: unknown, fallback = 2020): number {
  const year = Number(value)
  if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear() + 1) {
    return fallback
  }
  return year
}

function parseManwonPrice(value: unknown): number {
  const price = Number(value)
  if (!Number.isFinite(price) || price <= 0) return 0
  return Math.round(price * 10000)
}

function mapMarketCar(data: Record<string, any>): HeyDealerParsed {
  const detail = data.detail_info ?? {}
  const images = new Set<string>()

  for (const item of detail.images ?? []) {
    if (item?.url) images.add(String(item.url))
  }
  for (const item of detail.preview_images ?? []) {
    if (item?.url) images.add(String(item.url))
  }
  if (detail.inside_image_url) images.add(String(detail.inside_image_url))

  return {
    title: buildTitle([
      detail.brand_name,
      detail.model_part_name,
      detail.grade_part_name,
    ]),
    year: parseYear(detail.year),
    mileage: detail.mileage
      ? `${Number(detail.mileage).toLocaleString("ko-KR")} km`
      : "Unknown",
    krw: parseManwonPrice(data.price),
    images: Array.from(images).slice(0, 50),
    source: "heydealer",
  }
}

function mapDealerCar(data: Record<string, any>): HeyDealerParsed {
  const detail = data.detail ?? {}
  const auction = data.auction ?? {}
  const images = new Set<string>()

  for (const image of detail.image_urls ?? []) {
    if (image) images.add(String(image))
  }
  for (const image of detail.images ?? []) {
    if (typeof image === "string") images.add(image)
    if (image?.url) images.add(String(image.url))
  }

  const priceManwon =
    auction.my_bid?.price ??
    auction.approved_bid_price ??
    data.retail_price ??
    detail.retail_price ??
    detail.price ??
    0

  const title =
    detail.full_name ||
    buildTitle([
      detail.brand_name,
      detail.model_part_name || detail.full_name_without_brand,
      detail.grade_part_name,
    ])

  return {
    title: String(title || "HeyDealer auction car"),
    year: parseYear(
      detail.year ??
        (detail.initial_registration_date
          ? String(detail.initial_registration_date).slice(0, 4)
          : undefined)
    ),
    mileage: detail.mileage
      ? `${Number(detail.mileage).toLocaleString("ko-KR")} km`
      : "Unknown",
    krw: parseManwonPrice(priceManwon),
    images: Array.from(images).slice(0, 50),
    source: "heydealer",
  }
}

async function fetchMarketCar(hashId: string): Promise<HeyDealerParsed | null> {
  const response = await fetch(
    `https://market-api.heydealer.com/v2/customers/web/market/cars/${hashId}/`,
    {
      headers: {
        Accept: "application/json",
        "App-Os": "web",
        Origin: "https://www.heydealer.com",
        Referer: `https://www.heydealer.com/market/cars/${hashId}`,
        "User-Agent": USER_AGENT,
      },
    }
  )

  if (!response.ok) return null

  const data = await response.json()
  if (!data?.detail_info) return null

  return mapMarketCar(data)
}

async function fetchDealerCar(hashId: string): Promise<HeyDealerParsed | null> {
  const response = await fetch(`https://api.heydealer.com/cars/${hashId}/`, {
    headers: {
      Accept: "application/json",
      Referer: `https://dealer.heydealer.com/cars/${hashId}`,
      "User-Agent": USER_AGENT,
    },
  })

  if (!response.ok) return null

  const data = await response.json()
  if (!data?.detail && !data?.hash_id) return null

  return mapDealerCar(data)
}

export async function parseHeyDealerUrl(url: string): Promise<HeyDealerParsed> {
  const parsed = extractHeyDealerHashId(url)
  if (!parsed) {
    throw new Error("Некорректная ссылка HeyDealer.")
  }

  const attempts =
    parsed.kind === "dealer"
      ? [() => fetchDealerCar(parsed.hashId), () => fetchMarketCar(parsed.hashId)]
      : [() => fetchMarketCar(parsed.hashId), () => fetchDealerCar(parsed.hashId)]

  for (const attempt of attempts) {
    const result = await attempt()
    if (result?.title && result.krw > 0) return result
    if (result?.title) return result
  }

  throw new Error(
    "Не удалось получить данные HeyDealer. Проверьте ссылку или попробуйте позже."
  )
}
