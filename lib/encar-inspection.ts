export type BodyDamageItem = {
  part: string
  status: string
  code?: string
  /** exterior = кузов (верх), frame = рама/низ */
  layer?: "exterior" | "frame"
}

const STATUS_MAP: Record<string, string> = {
  X: "Замена",
  W: "Ремонт",
  C: "Коррозия",
  A: "Царапины",
  U: "Вмятина",
  T: "Повреждение",
}

/** Encar P-codes → part + layer. Titles override when present. */
const CODE_TO_PART: Record<string, { part: string; layer: "exterior" | "frame" }> = {
  // Exterior
  P011: { part: "Капот", layer: "exterior" },
  P012: { part: "Передний бампер", layer: "exterior" },
  P021: { part: "Левое крыло", layer: "exterior" },
  P022: { part: "Правое крыло", layer: "exterior" },
  P023: { part: "Левая передняя дверь", layer: "exterior" },
  P024: { part: "Правая передняя дверь", layer: "exterior" },
  P031: { part: "Левая задняя дверь", layer: "exterior" },
  P032: { part: "Правая задняя дверь", layer: "exterior" },
  P033: { part: "Левое заднее крыло", layer: "exterior" },
  P034: { part: "Правое заднее крыло", layer: "exterior" },
  P041: { part: "Крышка багажника", layer: "exterior" },
  P042: { part: "Крыша", layer: "exterior" },
  P061: { part: "Левая четверть", layer: "exterior" },
  P062: { part: "Правая четверть", layer: "exterior" },
  // Frame / underside
  P051: { part: "Радиаторная опора", layer: "frame" },
  P071: { part: "Передний сайд-мембер (лев.)", layer: "frame" },
  P072: { part: "Передний сайд-мембер (прав.)", layer: "frame" },
  P081: { part: "Задний сайд-мембер (лев.)", layer: "frame" },
  P082: { part: "Задний сайд-мембер (прав.)", layer: "frame" },
  P091: { part: "Стойка A (лев.)", layer: "frame" },
  P092: { part: "Стойка A (прав.)", layer: "frame" },
  P101: { part: "Стойка B (лев.)", layer: "frame" },
  P102: { part: "Стойка B (прав.)", layer: "frame" },
  P111: { part: "Стойка C (лев.)", layer: "frame" },
  P112: { part: "Стойка C (прав.)", layer: "frame" },
  P121: { part: "Пол багажника", layer: "frame" },
  P131: { part: "Передний пол", layer: "frame" },
  P141: { part: "Колёсная арка (лев.)", layer: "frame" },
  P142: { part: "Колёсная арка (прав.)", layer: "frame" },
  P151: { part: "Кросс-мембер", layer: "frame" },
  P161: { part: "Дашборд-панель", layer: "frame" },
  P171: { part: "Внутренняя панель (лев.)", layer: "frame" },
  P172: { part: "Внутренняя панель (прав.)", layer: "frame" },
  P181: { part: "Задняя панель", layer: "frame" },
  P191: { part: "Сайд-мембер (рама)", layer: "frame" },
}

function partFromTitle(title: string): { part: string; layer: "exterior" | "frame" } | null {
  const t = title || ""
  const left = /좌|左|left|\(л/i.test(t)
  const right = /우|右|right|\(п/i.test(t)

  // Frame / structure first
  if (/라디에이터\s*서포트|radiator\s*support/i.test(t)) return { part: "Радиаторная опора", layer: "frame" }
  if (/리어\s*패널|rear\s*panel|후판/i.test(t)) return { part: "Задняя панель", layer: "frame" }
  if (/사이드\s*멤버|side\s*member/i.test(t)) {
    if (/프레임|frame/i.test(t)) return { part: "Сайд-мембер (рама)", layer: "frame" }
    if (/프론트|front|전/i.test(t)) {
      return { part: left ? "Передний сайд-мембер (лев.)" : right ? "Передний сайд-мембер (прав.)" : "Передний сайд-мембер", layer: "frame" }
    }
    if (/리어|rear|후/i.test(t)) {
      return { part: left ? "Задний сайд-мембер (лев.)" : right ? "Задний сайд-мембер (прав.)" : "Задний сайд-мембер", layer: "frame" }
    }
    return { part: "Сайд-мембер (рама)", layer: "frame" }
  }
  if (/A\s*필러|a[- ]?pillar/i.test(t)) {
    return { part: left ? "Стойка A (лев.)" : right ? "Стойка A (прав.)" : "Стойка A", layer: "frame" }
  }
  if (/B\s*필러|b[- ]?pillar/i.test(t)) {
    return { part: left ? "Стойка B (лев.)" : right ? "Стойка B (прав.)" : "Стойка B", layer: "frame" }
  }
  if (/C\s*필러|c[- ]?pillar/i.test(t)) {
    return { part: left ? "Стойка C (лев.)" : right ? "Стойка C (прав.)" : "Стойка C", layer: "frame" }
  }
  if (/트렁크\s*플로어|trunk\s*floor/i.test(t)) return { part: "Пол багажника", layer: "frame" }
  if (/플로어|floor\s*panel/i.test(t)) return { part: "Передний пол", layer: "frame" }
  if (/휠\s*하우스|wheel\s*house/i.test(t)) {
    return { part: left ? "Колёсная арка (лев.)" : right ? "Колёсная арка (прав.)" : "Колёсная арка", layer: "frame" }
  }
  if (/크로스\s*멤버|cross\s*member/i.test(t)) return { part: "Кросс-мембер", layer: "frame" }
  if (/인사이드\s*패널|inside\s*panel/i.test(t)) {
    return { part: left ? "Внутренняя панель (лев.)" : right ? "Внутренняя панель (прав.)" : "Внутренняя панель", layer: "frame" }
  }

  // Exterior
  if (/후드|bonnet|hood/i.test(t)) return { part: "Капот", layer: "exterior" }
  if (/루프|roof/i.test(t)) return { part: "Крыша", layer: "exterior" }
  if (/트렁크|trunk|테일게이트|테일 게이트/i.test(t)) return { part: "Крышка багажника", layer: "exterior" }
  if (/리어\s*범퍼|rear\s*bumper|후방\s*범퍼/i.test(t)) return { part: "Задний бампер", layer: "exterior" }
  if (/프론트\s*범퍼|front\s*bumper|전방\s*범퍼/i.test(t)) return { part: "Передний бампер", layer: "exterior" }

  if (/쿼터/i.test(t)) {
    if (left) return { part: "Левая четверть", layer: "exterior" }
    if (right) return { part: "Правая четверть", layer: "exterior" }
    return { part: "Четверть", layer: "exterior" }
  }
  if (/리어\s*휀더|rear\s*fender|rear\s*quarter/i.test(t)) {
    if (left) return { part: "Левое заднее крыло", layer: "exterior" }
    if (right) return { part: "Правое заднее крыло", layer: "exterior" }
    return null
  }
  if (/프론트\s*휀더|front\s*fender|펜더|휀더/i.test(t)) {
    if (left) return { part: "Левое крыло", layer: "exterior" }
    if (right) return { part: "Правое крыло", layer: "exterior" }
    return null
  }
  if (/리어\s*도어|rear\s*door|뒷문/i.test(t)) {
    if (left) return { part: "Левая задняя дверь", layer: "exterior" }
    if (right) return { part: "Правая задняя дверь", layer: "exterior" }
    return null
  }
  if (/프론트\s*도어|front\s*door|앞문|도어/i.test(t)) {
    if (left) return { part: "Левая передняя дверь", layer: "exterior" }
    if (right) return { part: "Правая передняя дверь", layer: "exterior" }
    return null
  }
  return null
}

function statusFromCodes(statusTypes: Array<{ code?: string; title?: string }> | undefined): { status: string; code: string } | null {
  if (!statusTypes?.length) return null
  const priority = ["X", "W", "T", "C", "U", "A"]
  const codes = statusTypes.map((s) => String(s.code || "").toUpperCase())
  for (const p of priority) {
    if (codes.includes(p) && STATUS_MAP[p]) return { status: STATUS_MAP[p], code: p }
  }
  return null
}

export function extractEncarVehicleId(url: string): string | null {
  const m =
    url.match(/encar\.com\/cars\/detail\/(\d+)/i) ||
    url.match(/encar\.com\/cars\/report\/inspect\/(\d+)/i) ||
    url.match(/[?&]carid=(\d+)/i) ||
    url.match(/\/(\d{6,})(?:\?|$)/)
  return m?.[1] || null
}

export async function fetchEncarBodyDamage(vehicleId: string): Promise<{
  bodyDamage: BodyDamageItem[]
  inspectionMeta: {
    supplyNum?: string
    accident?: boolean
    simpleRepair?: boolean
    mileage?: number
    vin?: string
  }
}> {
  const res = await fetch(
    `https://api.encar.com/v1/readside/inspection/vehicle/${vehicleId}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        Referer: `https://fem.encar.com/cars/report/inspect/${vehicleId}`,
      },
      cache: "no-store",
    }
  )
  if (!res.ok) {
    return { bodyDamage: [], inspectionMeta: {} }
  }
  const data = await res.json()
  const outers: any[] = Array.isArray(data?.outers) ? data.outers : data?.outers ? [data.outers] : []
  const byPart = new Map<string, { status: string; code: string; layer: "exterior" | "frame" }>()

  for (const outer of outers) {
    const code = String(outer?.type?.code || "").toUpperCase()
    const title = String(outer?.type?.title || "")
    // Prefer Korean title — Encar P-codes are inconsistent across years
    const fromTitle = partFromTitle(title)
    const fromCode = CODE_TO_PART[code]
    const mappedPart = fromTitle || fromCode
    const mapped = statusFromCodes(outer?.statusTypes)
    if (!mappedPart || !mapped) continue

    // RANK_A/B/C → frame even if title ambiguous
    const attrs: string[] = Array.isArray(outer?.attributes) ? outer.attributes.map(String) : []
    let layer = mappedPart.layer
    if (attrs.some((a) => /^RANK_[ABC]$/i.test(a))) layer = "frame"

    const prev = byPart.get(mappedPart.part)
    const rank = (s: string) => ["Замена", "Ремонт", "Коррозия", "Царапины", "Вмятина", "Повреждение", "Хорошо", "Отлично"].indexOf(s)
    if (!prev || rank(mapped.status) < rank(prev.status)) {
      byPart.set(mappedPart.part, { ...mapped, layer })
    }
  }

  const detail = data?.master?.detail || {}
  return {
    bodyDamage: [...byPart.entries()].map(([part, v]) => ({
      part,
      status: v.status,
      code: v.code,
      layer: v.layer,
    })),
    inspectionMeta: {
      supplyNum: data?.master?.supplyNum || detail?.recordNo,
      accident: Boolean(data?.master?.accdient),
      simpleRepair: Boolean(data?.master?.simpleRepair),
      mileage: typeof detail?.mileage === "number" ? detail.mileage : undefined,
      vin: detail?.vin || undefined,
    },
  }
}

export type InsuranceRecordItem = {
  date: string
  type: string
  amount: number
  description: string
}

export type InsuranceSummary = {
  myAccidentCnt?: number
  otherAccidentCnt?: number
  ownerChangeCnt?: number
  myAccidentCost?: number
  otherAccidentCost?: number
  robberCnt?: number
  totalLossCnt?: number
  floodTotalLossCnt?: number
  vehicleNo?: string
}

const ACCIDENT_TYPE_RU: Record<string, string> = {
  "1": "Страховой случай",
  "2": "ДТП (своё авто)",
  "3": "ДТП (другая сторона)",
  "4": "Угон",
  "5": "Полная гибель",
  "6": "Потоп / стихия",
}

function formatKrw(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₩"
}

/** Insurance / CarHistory-style record from Encar (보험이력). */
export async function fetchEncarInsuranceHistory(vehicleId: string): Promise<{
  insuranceRecords: InsuranceRecordItem[]
  insuranceSummary: InsuranceSummary
}> {
  const empty = { insuranceRecords: [] as InsuranceRecordItem[], insuranceSummary: {} as InsuranceSummary }
  try {
    const vehRes = await fetch(`https://api.encar.com/v1/readside/vehicle/${vehicleId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        Referer: `https://fem.encar.com/cars/report/inspect/${vehicleId}`,
      },
      cache: "no-store",
    })
    if (!vehRes.ok) return empty
    const veh = await vehRes.json()
    const vehicleNo = String(veh?.vehicleNo || "").trim()
    if (!vehicleNo) return empty

    let data: any = null
    const openRes = await fetch(
      `https://api.encar.com/v1/readside/record/vehicle/${vehicleId}/open?vehicleNo=${encodeURIComponent(vehicleNo)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
          Referer: `https://fem.encar.com/cars/report/inspect/${vehicleId}`,
          Origin: "https://fem.encar.com",
        },
        cache: "no-store",
      }
    )
    if (openRes.ok) {
      data = await openRes.json()
    } else {
      const sumRes = await fetch(
        `https://api.encar.com/v1/readside/record/vehicle/${vehicleId}/summary`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
            Referer: `https://fem.encar.com/cars/report/inspect/${vehicleId}`,
          },
          cache: "no-store",
        }
      )
      if (!sumRes.ok) return empty
      data = await sumRes.json()
    }

    const summary: InsuranceSummary = {
      myAccidentCnt: Number(data?.myAccidentCnt) || 0,
      otherAccidentCnt: Number(data?.otherAccidentCnt) || 0,
      ownerChangeCnt: Number(data?.ownerChangeCnt) || 0,
      myAccidentCost: Number(data?.myAccidentCost) || 0,
      otherAccidentCost: Number(data?.otherAccidentCost) || 0,
      robberCnt: Number(data?.robberCnt) || 0,
      totalLossCnt: Number(data?.totalLossCnt) || 0,
      floodTotalLossCnt: Number(data?.floodTotalLossCnt) || 0,
      vehicleNo,
    }

    const accidents: any[] = Array.isArray(data?.accidents) ? data.accidents : []
    const insuranceRecords: InsuranceRecordItem[] = accidents.map((a) => {
      const typeCode = String(a?.type ?? "")
      const type = ACCIDENT_TYPE_RU[typeCode] || "Страховой случай"
      const amount = Number(a?.insuranceBenefit) || 0
      const parts = [
        a?.partCost ? `Запчасти: ${formatKrw(Number(a.partCost))}` : null,
        a?.laborCost ? `Работа: ${formatKrw(Number(a.laborCost))}` : null,
        a?.paintingCost ? `Покраска: ${formatKrw(Number(a.paintingCost))}` : null,
      ].filter(Boolean)
      return {
        date: String(a?.date || "").slice(0, 10),
        type,
        amount,
        description: parts.join(" · "),
      }
    })

    if (!insuranceRecords.length && (summary.myAccidentCnt || summary.otherAccidentCnt)) {
      if (summary.myAccidentCnt) {
        insuranceRecords.push({
          date: "",
          type: "ДТП (своё авто)",
          amount: summary.myAccidentCost || 0,
          description: `Случаев: ${summary.myAccidentCnt}`,
        })
      }
      if (summary.otherAccidentCnt) {
        insuranceRecords.push({
          date: "",
          type: "ДТП (другая сторона)",
          amount: summary.otherAccidentCost || 0,
          description: `Случаев: ${summary.otherAccidentCnt}`,
        })
      }
    }

    return { insuranceRecords, insuranceSummary: summary }
  } catch {
    return empty
  }
}
