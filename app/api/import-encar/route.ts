import { NextRequest, NextResponse } from "next/server"
import { deliveryUsdByKrw } from "@/lib/delivery"
import { fetchEncarVehicleForCalc } from "@/lib/encar-vehicle"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const vehicleId = String(body?.vehicleId || body?.url || "").trim()
    if (!vehicleId) {
      return NextResponse.json({ error: "Нет ID / ссылки Encar" }, { status: 400 })
    }

    const usdKztRate = Number(body?.usdKztRate) || 467
    const krwUsdRate = Number(body?.krwUsdRate) || 1380

    const car = await fetchEncarVehicleForCalc(vehicleId)
    const deliveryUsd = deliveryUsdByKrw(car.priceKRW)
    if (deliveryUsd === null) {
      return NextResponse.json(
        { skipped: true, reason: "price_below_5m", priceKRW: car.priceKRW },
        { status: 200 }
      )
    }

    const carPriceUsd = Math.round(car.priceKRW / krwUsdRate)
    const carPriceKzt = Math.round(carPriceUsd * usdKztRate)
    const logistics = Math.round(deliveryUsd * usdKztRate)
    const almatyTotal = carPriceKzt + logistics

    const saveRes = await fetch(new URL("/api/save-to-catalog", req.nextUrl.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: car.sourceUrl,
        vin: car.vin,
        title: car.title,
        brand: car.brand,
        model: car.model,
        year: car.year,
        mileage: car.mileage,
        priceKRW: car.priceKRW,
        priceUsd: carPriceUsd,
        images: car.images,
        selectedEngine: car.engine,
        almatyPriceKzt: almatyTotal,
        priceDelivery: almatyTotal,
        total: 0,
        serviceFee: 0,
        logistics,
        logisticsUsd: deliveryUsd,
        carPriceKzt,
        usdKztRate,
        bodyDamage: car.bodyDamage,
        insuranceRecords: car.insuranceRecords,
        insuranceSummary: car.insuranceSummary,
        vehicleType: car.vehicleType,
        bodyType: car.bodyType,
        fuel: car.fuel,
        transmission: car.transmission,
        loadCapacity: car.loadCapacity,
      }),
    })

    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      return NextResponse.json(
        { error: saveData?.error || "Не удалось сохранить в каталог", details: saveData },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(saveData?.duplicate),
      vehicle: saveData?.vehicle,
      car: {
        title: car.title,
        year: car.year,
        mileage: `${new Intl.NumberFormat("ru-RU").format(car.mileage)} km`,
        priceKrw: car.priceKRW,
        images: car.images,
        carPriceUsd,
        carPriceKzt,
        logisticsUsd: deliveryUsd,
        logistics,
        serviceFee: 0,
        almatyTotal,
        selectedEngine: car.engine,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Импорт Encar не удался" },
      { status: 500 }
    )
  }
}
