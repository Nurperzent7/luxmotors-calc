import { NextRequest, NextResponse } from "next/server"

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
  const modelHints: Array<{ re: RegExp; brand: string }> = [
    { re: /\bgrandeur\b/i, brand: "Hyundai" },
    { re: /\bpalisade\b/i, brand: "Hyundai" },
    { re: /\btucson\b/i, brand: "Hyundai" },
    { re: /\bsanta\s*fe\b/i, brand: "Hyundai" },
    { re: /\bioniq\b/i, brand: "Hyundai" },
    { re: /\bsonata\b/i, brand: "Hyundai" },
    { re: /\bstaria\b/i, brand: "Hyundai" },
    { re: /\bcarnival\b/i, brand: "Kia" },
    { re: /\bsorento\b/i, brand: "Kia" },
    { re: /\bsportage\b/i, brand: "Kia" },
    { re: /\bk5\b/i, brand: "Kia" },
    { re: /\bev6\b/i, brand: "Kia" },
    { re: /\bgv80\b|\bg80\b|\bg90\b/i, brand: "Genesis" },
  ]
  for (const hint of modelHints) {
    if (hint.re.test(clean)) {
      return { brand: hint.brand, model: clean }
    }
  }

  const parts = clean.split(" ")
  if (parts.length === 1) return { brand: parts[0], model: parts[0] }
  return { brand: parts[0], model: parts.slice(1).join(" ") }
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
    const { brand, model } = body.brand && body.model
      ? { brand: String(body.brand), model: String(body.model) }
      : parseBrandModel(title)

    const engine = String(body.selectedEngine || body.engine || "2.0 л")
    const engineVolume = engine.replace(/\s*л\s*$/i, "").trim()
    const priceKRW = digits(body.priceKRW ?? body.price)
    const priceUsd = Number(body.priceUsd) || 0
    const carPriceKzt = Number(body.carPriceKzt) || 0
    const almaty = Number(body.priceDelivery ?? body.almatyPriceKzt ?? 0) || 0
    const logistics = Number(body.logistics) || 0
    const serviceFee = Number(body.serviceFee) || 200000

    const payload = {
      sourceUrl: String(body.sourceUrl || "").trim(),
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
      commission: serviceFee,
      priceDescription: [
        priceKRW ? `Авто: ${new Intl.NumberFormat("ru-RU").format(priceKRW)} ₩` : null,
        priceUsd ? `Авто: $${new Intl.NumberFormat("en-US").format(priceUsd)}` : null,
        carPriceKzt ? `Авто: ${new Intl.NumberFormat("ru-RU").format(carPriceKzt)} ₸` : null,
        logistics ? `Логистика: ${new Intl.NumberFormat("ru-RU").format(logistics)} ₸` : null,
        `Услуга Lux Motors: ${new Intl.NumberFormat("ru-RU").format(serviceFee)} ₸`,
        almaty ? `Итого до Алматы: ${new Intl.NumberFormat("ru-RU").format(almaty)} ₸` : null,
        "Чтобы узнать цену под ключ — обратитесь к нам в WhatsApp",
        body.selectedEngine ? `Двигатель: ${body.selectedEngine}` : null,
        body.sourceUrl ? `Источник: ${body.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      imageUrls: Array.isArray(body.images) ? body.images.slice(0, 20) : [],
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
