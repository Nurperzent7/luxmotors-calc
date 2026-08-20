/** Коммерческий транспорт / спецтехника Encar → каталог «Спецтехника». */

const TRUCK_TYPES = new Set(["TRUCK", "SPECIAL", "EQUIPMENT", "CARGO"])

const SPECIAL_NAME_RE =
  /bongo|porter|mighty|봉고|포터|마이티|고소작업|고소|활선|특장|크레인|냉동|덤프|카고트럭/i

const BODY_TYPE_RULES: Array<{ re: RegExp; type: string }> = [
  { re: /고소|활선|사다리|aerial|boom/i, type: "Автовышка" },
  { re: /크레인|crane/i, type: "Автокран" },
  { re: /냉동|냉장|reef/i, type: "Рефрижератор" },
  { re: /쓰레기|진개|암롤/i, type: "Мусоровоз" },
  { re: /유조|급유|탱커/i, type: "Топливозаправщик" },
  { re: /믹서|콘크리트/i, type: "Автобетоносмеситель" },
  { re: /견인|렉카|evac/i, type: "Эвакуатор" },
]

export type CatalogVehicleKind = "CAR" | "MOTORCYCLE" | "SPECIAL"

export type EncarCatalogClass = {
  vehicleType: CatalogVehicleKind
  bodyType?: string
  fuel?: string
  transmission?: string
  loadCapacity?: number
}

function blob(parts: Array<unknown>): string {
  return parts.map((p) => String(p || "")).join(" ")
}

export function isSpecialEquipmentText(...parts: Array<unknown>): boolean {
  return SPECIAL_NAME_RE.test(blob(parts))
}

export function specialBodyTypeFromText(...parts: Array<unknown>): string {
  const text = blob(parts)
  for (const rule of BODY_TYPE_RULES) {
    if (rule.re.test(text)) return rule.type
  }
  return "Другой"
}

export function mapEncarFuel(name?: string | null): string | undefined {
  const n = String(name || "").toLowerCase()
  if (!n) return undefined
  if (n.includes("디젤") || n.includes("diesel")) return "Дизель"
  if (n.includes("하이브리드") || n.includes("hybrid")) return "Гибрид"
  if (n.includes("전기") || n.includes("electric")) return "Электро"
  if (n.includes("lpg") || n.includes("가스")) return "Газ"
  if (n.includes("가솔린") || n.includes("휘발") || n.includes("gasoline") || n.includes("petrol")) {
    return "Бензин"
  }
  return undefined
}

export function mapEncarTransmission(name?: string | null): string | undefined {
  const n = String(name || "").toLowerCase()
  if (!n) return undefined
  if (n.includes("수동") || n.includes("manual")) return "Механика"
  if (n.includes("오토") || n.includes("자동") || n.includes("auto")) return "Автомат"
  return undefined
}

export function parseLoadTons(capacityName?: string | null): number | undefined {
  const m = String(capacityName || "").match(/(\d+(?:\.\d+)?)\s*톤/)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) ? n : undefined
}

export function classifyEncarVehicle(veh: any): EncarCatalogClass {
  const type = String(
    veh?.vehicleType || veh?.category?.type || veh?.advertisement?.type || ""
  ).toUpperCase()
  const titleBits = blob([
    veh?.category?.modelName,
    veh?.category?.modelEnglishName,
    veh?.category?.modelGroupName,
    veh?.category?.modelGroupEnglishName,
    veh?.category?.formName,
    veh?.category?.formDetailName,
    veh?.category?.specialManufacturerName,
    veh?.category?.gradeName,
  ])
  const isTruck =
    TRUCK_TYPES.has(type) ||
    Boolean(veh?.category?.specialManufacturerName) ||
    isSpecialEquipmentText(titleBits)

  if (!isTruck) {
    return {
      vehicleType: "CAR",
      fuel: mapEncarFuel(veh?.spec?.fuelName),
      transmission: mapEncarTransmission(veh?.spec?.transmissionName),
    }
  }

  return {
    vehicleType: "SPECIAL",
    bodyType: specialBodyTypeFromText(titleBits),
    fuel: mapEncarFuel(veh?.spec?.fuelName),
    transmission: mapEncarTransmission(veh?.spec?.transmissionName),
    loadCapacity: parseLoadTons(veh?.category?.capacityName),
  }
}

export function classifyFromSavePayload(body: {
  vehicleType?: string
  title?: string
  brand?: string
  model?: string
  sourceUrl?: string
  bodyType?: string
}): EncarCatalogClass {
  const given = String(body.vehicleType || "").trim().toUpperCase()
  if (given === "SPECIAL" || given === "TRUCK") {
    return {
      vehicleType: "SPECIAL",
      bodyType: body.bodyType || specialBodyTypeFromText(body.title, body.model, body.brand),
    }
  }
  if (given === "MOTORCYCLE") return { vehicleType: "MOTORCYCLE" }
  if (given === "CAR") {
    if (isSpecialEquipmentText(body.title, body.brand, body.model)) {
      return {
        vehicleType: "SPECIAL",
        bodyType: body.bodyType || specialBodyTypeFromText(body.title, body.model, body.brand),
      }
    }
    return { vehicleType: "CAR" }
  }
  if (isSpecialEquipmentText(body.title, body.brand, body.model, body.sourceUrl, body.bodyType)) {
    return {
      vehicleType: "SPECIAL",
      bodyType: body.bodyType || specialBodyTypeFromText(body.title, body.model, body.brand),
    }
  }
  return { vehicleType: "CAR" }
}
