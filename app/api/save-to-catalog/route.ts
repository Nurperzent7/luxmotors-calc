import { NextRequest, NextResponse } from "next/server"
import { seededShuffle } from "@/lib/shuffle"

export const runtime = "nodejs"

const KNOWN_BRANDS = [
  "Mercedes-Benz", "Land Rover", "Range Rover", "Aston Martin", "Alfa Romeo",
  "Rolls-Royce", "KG Mobility", "SsangYong", "Great Wall", "Lynk & Co",
  "Chevrolet Korea", "Renault Korea", "Harley-Davidson", "Royal Enfield",
  "MV Agusta", "Genesis", "Hyundai", "Kia", "BMW", "Audi", "Volkswagen",
  "Porsche", "Opel", "Toyota", "Lexus", "Honda", "Acura", "Nissan", "Infiniti",
  "Mazda", "Subaru", "Mitsubishi", "Suzuki", "Ford", "Cadillac", "Chevrolet",
  "Lincoln", "Chrysler", "Dodge", "Jeep", "RAM", "GMC", "Buick", "Tesla",
  "Volvo", "Polestar", "Jaguar", "Bentley", "MINI", "Ferrari", "Lamborghini",
  "Maserati", "Fiat", "Peugeot", "Renault", "Citroen", "BYD", "Zeekr", "NIO",
  "Chery", "Geely", "Haval", "Changan", "OMODA", "Jaecoo", "Tank", "Lixiang",
  "Xpeng", "Avatr", "Exeed", "Jetour", "BAIC", "GAC", "Dongfeng", "MG",
  "Hongqi", "FAW", "Wuling", "Leapmotor", "HiPhi", "Xiaomi", "AITO", "Deepal",
  "Denza", "Voyah", "Ora", "Wey", "Baojun", "Roewe", "Seres", "JAC", "JMC",
  "Maxus", "Foton", "Lotus", "Škoda", "SEAT", "Dacia", "DS", "Alpine", "Alpina",
  "Lancia", "Bugatti", "Koenigsegg", "Daihatsu", "Isuzu", "Datsun", "Maybach",
  "Smart", "McLaren", "Lada", "UAZ", "VinFast", "Daewoo", "Ravon", "Saab",
  "Proton", "Rivian", "Lucid",
].sort((a, b) => b.length - a.length)

function parseBrandModel(title: string): { brand: string; model: string } {
  const clean = (title || "").replace(/\s+/g, " ").trim()
  if (!clean) return { brand: "Unknown", model: "Unknown" }
  const lower = clean.toLowerCase()
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand.toLowerCase() + " ") || lower === brand.toLowerCase()) {
      const model = clean.slice(brand.length).trim() || "Unknown"
      return { brand, model }
    }
  }

  // Частые модели Encar без марки в заголовке
  const modelHints: Array<{ re: RegExp; brand: string; model?: string }> = [
    { re: /\bes\s*300h?\b|\bes300h?\b/i, brand: "Lexus", model: "ES300h" },
    { re: /\bes\s*350h?\b|\bes350h?\b/i, brand: "Lexus", model: "ES350" },
    { re: /\bes\s*250h?\b|\bes250h?\b/i, brand: "Lexus", model: "ES250" },
    { re: /\bes\s*300\b|\bes300\b/i, brand: "Lexus", model: "ES300" },
    { re: /\bg[- ]?class\b|\bg[- ]?класс\b|\bamg\s*g\s*63\b/i, brand: "Mercedes-Benz", model: "G-Class" },
    { re: /\be[- ]?class\b|\be[- ]?класс\b/i, brand: "Mercedes-Benz", model: "E-Class" },
    { re: /\bs[- ]?class\b|\bs[- ]?класс\b/i, brand: "Mercedes-Benz", model: "S-Class" },
    { re: /\bc[- ]?class\b|\bc[- ]?класс\b/i, brand: "Mercedes-Benz", model: "C-Class" },
    { re: /\bgrandeur\b/i, brand: "Hyundai" },
    { re: /\bpalisade\b/i, brand: "Hyundai", model: "Palisade" },
    { re: /\btucson\b/i, brand: "Hyundai" },
    { re: /\bsanta\s*fe\b/i, brand: "Hyundai", model: "Santa Fe" },
    { re: /\bioniq\b/i, brand: "Hyundai" },
    { re: /\bsonata\b/i, brand: "Hyundai" },
    { re: /\bstaria\b/i, brand: "Hyundai" },
    { re: /\b5\s*series\b/i, brand: "BMW", model: "5 Series" },
    { re: /\brx\s*450h?\b|\brx450h?\b/i, brand: "Lexus", model: "RX450h" },
    { re: /\brx\s*350h?\b|\brx350h?\b/i, brand: "Lexus", model: "RX350h" },
    { re: /\blx\s*\d*\b/i, brand: "Lexus", model: "LX" },
    { re: /\bcarnival\b/i, brand: "Kia" },
    { re: /\bsorento\b/i, brand: "Kia" },
    { re: /\bsportage\b/i, brand: "Kia" },
    { re: /\bk5\b/i, brand: "Kia" },
    { re: /\bev6\b/i, brand: "Kia" },
    { re: /\bgv80\b|\bg80\b|\bg90\b/i, brand: "Genesis" },
  ]
  for (const hint of modelHints) {
    if (hint.re.test(clean)) {
      return { brand: hint.brand, model: hint.model || clean }
    }
  }

  const parts = clean.split(" ")
  if (parts.length === 1) return { brand: parts[0], model: parts[0] }
  return { brand: parts[0], model: parts.slice(1).join(" ") }
}

/** If brand field itself is a model name (Encar quirk), remap to real brand. */
function normalizeBrandModel(brand: string, model: string, title = ""): { brand: string; model: string } {
  const combined = `${brand} ${model} ${title}`.trim()
  const remapped = parseBrandModel(combined.startsWith(brand) ? combined : `${brand} ${model}`.trim())
  // Prefer remap when original brand is not a known manufacturer
  const brandKnown = KNOWN_BRANDS.some((b) => b.toLowerCase() === brand.toLowerCase())
  if (!brandKnown && remapped.brand !== brand) {
    const detail = model && model.toLowerCase() !== brand.toLowerCase() ? model : ""
    const series = remapped.model
    return {
      brand: remapped.brand,
      model: detail && !detail.toLowerCase().includes(series.toLowerCase())
        ? `${series} ${detail}`.trim()
        : detail || series,
    }
  }
  if (!brandKnown) return remapped
  return { brand, model: model || remapped.model }
}

function digits(value: unknown): number {
  const n = Number(String(value ?? "").replace(/[^\d]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const secret = process.env.CALC_IMPORT_SECRET || "luxmotors-calc-import-2026"
    // Locally default to local backend; on Vercel use production site
    const apiBase = (
      process.env.LUXMOTORS_API_URL ||
      (process.env.VERCEL ? "https://luxmotors.kz" : "http://127.0.0.1:8080")
    ).replace(/\/$/, "")

    const title = String(body.title || "")
    const raw = body.brand && body.model
      ? { brand: String(body.brand), model: String(body.model) }
      : parseBrandModel(title)
    const { brand, model } = normalizeBrandModel(raw.brand, raw.model, title)

    const engine = String(body.selectedEngine || body.engine || "2.0 л")
    const engineVolume = engine.replace(/\s*л\s*$/i, "").trim()
    const priceKRW = digits(body.priceKRW ?? body.price)
    const priceUsd = Number(body.priceUsd) || 0
    const carPriceKzt = Number(body.carPriceKzt) || 0
    const almaty = Number(body.priceDelivery ?? body.almatyPriceKzt ?? 0) || 0
    const logistics = Number(body.logistics) || 0
    const serviceFee = Number(body.serviceFee) || 0

    const payload = {
      sourceUrl: String(body.sourceUrl || "").trim(),
      vin: body.vin ? String(body.vin).trim() : null,
      title,
      brand,
      model,
      year: Number(body.year) || new Date().getFullYear(),
      mileage: digits(body.mileage),
      engine,
      engineVolume: engineVolume ? `${engineVolume}л` : null,
      priceKRW,
      priceKZT: almaty,
      priceDelivery: almaty,
      priceTurnkey: 0,
      registrationFeeKZT: 0,
      recyclingFeeKZT: 0,
      customsDutyKZT: 0,
      commission: serviceFee > 0 ? serviceFee : 0,
      priceDescription: [
        priceKRW ? `Авто: ${new Intl.NumberFormat("ru-RU").format(priceKRW)} ₩` : null,
        priceUsd ? `Авто: $${new Intl.NumberFormat("en-US").format(priceUsd)}` : null,
        carPriceKzt ? `Авто: ${new Intl.NumberFormat("ru-RU").format(carPriceKzt)} ₸` : null,
        logistics ? `Логистика: ${new Intl.NumberFormat("ru-RU").format(logistics)} ₸` : null,
        serviceFee > 0
          ? `Услуга Lux Motors: ${new Intl.NumberFormat("ru-RU").format(serviceFee)} ₸`
          : null,
        almaty ? `Итого до Алматы: ${new Intl.NumberFormat("ru-RU").format(almaty)} ₸` : null,
        "Чтобы узнать цену под ключ — обратитесь к нам в WhatsApp",
        body.selectedEngine ? `Двигатель: ${body.selectedEngine}` : null,
        body.sourceUrl ? `Источник: ${body.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      imageUrls: seededShuffle(
        Array.isArray(body.images) ? body.images.filter(Boolean) : [],
        String(body.sourceUrl || title)
      ).slice(0, 20),
      bodyDamage: Array.isArray(body.bodyDamage) ? body.bodyDamage : [],
      insuranceRecords: Array.isArray(body.insuranceRecords) ? body.insuranceRecords : [],
      insuranceSummary: body.insuranceSummary && typeof body.insuranceSummary === "object" ? body.insuranceSummary : null,
    }

    if (!payload.sourceUrl) {
      return NextResponse.json({ error: "sourceUrl required" }, { status: 400 })
    }

    const res = await fetch(`${apiBase}/api/vehicles/from-calculator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Calc-Secret": secret,
      },
      body: JSON.stringify(payload),
    })

    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: "Catalog save failed", status: res.status, details: data },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, vehicle: data })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    )
  }
}
