const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export type KbChachachaParsed = {
  title: string
  year: number
  mileage: string
  krw: number
  images: string[]
  source: "kbchachacha"
}

export function isKbChachachaUrl(url: string): boolean {
  const value = url.trim()
  try {
    return new URL(value).hostname.toLowerCase().includes("kbchachacha.com")
  } catch {
    return /kbchachacha\.com/i.test(value)
  }
}

export function extractKbCarSeq(url: string): string | null {
  const value = url.trim()

  const queryMatch = value.match(/[?&#]carSeq=(\d+)/i)
  if (queryMatch?.[1]) return queryMatch[1]

  const pathMatch = value.match(/\/cars?\/(\d+)/i)
  if (pathMatch?.[1]) return pathMatch[1]

  if (/^\d{5,}$/.test(value)) return value

  return null
}

function parseYearFromDesc(desc: string): number {
  // 18년01월(18년형) or 18년형
  const match =
    desc.match(/\((\d{2})년형\)/) ||
    desc.match(/(\d{2})년형/) ||
    desc.match(/(\d{2})년\d{0,2}월/)

  if (!match?.[1]) return 2020
  const shortYear = Number(match[1])
  if (!Number.isFinite(shortYear)) return 2020
  return shortYear >= 30 ? 1900 + shortYear : 2000 + shortYear
}

function parseMileageFromDesc(desc: string): string {
  const match = desc.match(/([\d,]+)\s*km/i)
  if (!match?.[1]) return "Unknown"
  return `${match[1].replace(/,/g, "")} km`
}

function parseTitleFromDesc(desc: string): string {
  // (65너4276)기아올 뉴 모닝(JA) 럭셔리  | 18년01월...
  const withoutPlate = desc.replace(/^\([^)]*\)/, "").trim()
  const title = withoutPlate.split("|")[0]?.trim() || withoutPlate
  return title.replace(/\s+/g, " ").trim()
}

function parsePriceKrw(html: string): number {
  const sellAmt = html.match(/sellAmt\s*=\s*["'](\d+)/i)?.[1]
  if (sellAmt) {
    const manwon = Number(sellAmt)
    if (Number.isFinite(manwon) && manwon > 0) return Math.round(manwon * 10000)
  }

  const strong = html.match(/c-title-28[^>]*>\s*([\d,]+)\s*만원/i)?.[1]
  if (strong) {
    const manwon = Number(strong.replace(/,/g, ""))
    if (Number.isFinite(manwon) && manwon > 0) return Math.round(manwon * 10000)
  }

  const generic = html.match(/([\d,]+)\s*만원/)
  if (generic?.[1]) {
    const manwon = Number(generic[1].replace(/,/g, ""))
    if (Number.isFinite(manwon) && manwon > 0) return Math.round(manwon * 10000)
  }

  return 0
}

function extractImages(html: string, carSeq: string): string[] {
  const images = new Set<string>()

  for (const match of html.matchAll(
    /https:\/\/img\.kbchachacha\.com\/IMG\/carimg\/[^"'?\s]+/gi
  )) {
    images.add(match[0].replace(/\?.*$/, ""))
  }

  // Prefer images that contain the carSeq in the path
  const preferred = [...images].filter((url) => url.includes(carSeq))
  const list = preferred.length > 0 ? preferred : [...images]
  return list.slice(0, 50)
}

function buildDetailUrl(carSeq: string): string {
  return `https://www.kbchachacha.com/public/car/detail.kbc?carSeq=${carSeq}`
}

export async function parseKbChachachaUrl(url: string): Promise<KbChachachaParsed> {
  const carSeq = extractKbCarSeq(url)
  if (!carSeq) {
    throw new Error("Некорректная ссылка KB CHACHACHA. Нужен carSeq в ссылке.")
  }

  const detailUrl = isKbChachachaUrl(url) && /detail\.kbc/i.test(url)
    ? url.trim()
    : buildDetailUrl(carSeq)

  const response = await fetch(detailUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      Referer: "https://www.kbchachacha.com/public/search/main.kbc",
    },
  })

  if (!response.ok) {
    throw new Error("Не удалось открыть страницу KB CHACHACHA.")
  }

  const html = await response.text()
  if (!html || html.length < 500) {
    throw new Error("Пустой ответ KB CHACHACHA.")
  }

  const ogDesc =
    html.match(/property=["']og:description["']\s+content=["']([^"']*)["']/i)?.[1] ||
    html.match(/content=["']([^"']*)["']\s+property=["']og:description["']/i)?.[1] ||
    ""

  const title = parseTitleFromDesc(ogDesc) || `KB CHACHACHA #${carSeq}`
  const year = parseYearFromDesc(ogDesc)
  const mileage = parseMileageFromDesc(ogDesc)
  const krw = parsePriceKrw(html)
  const images = extractImages(html, carSeq)

  if (!krw && !title) {
    throw new Error(
      "Не удалось получить данные KB CHACHACHA. Проверьте ссылку или попробуйте позже."
    )
  }

  return {
    title,
    year,
    mileage,
    krw,
    images,
    source: "kbchachacha",
  }
}
