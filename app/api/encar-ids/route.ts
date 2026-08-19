import { NextRequest, NextResponse } from "next/server"
import { isEncarSearchUrl, resolveEncarVehicleIds } from "@/lib/encar-list"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const url = String(body?.url || "").trim()
    const limit = Number(body?.limit) || 10
    if (!url) {
      return NextResponse.json({ error: "Нет ссылки Encar" }, { status: 400 })
    }
    const { ids, query } = await resolveEncarVehicleIds(url, limit)
    if (!ids.length) {
      return NextResponse.json(
        {
          error: isEncarSearchUrl(url)
            ? "Не удалось взять объявления с этой выдачи Encar. Вставьте ссылки на карточки или поиск с фильтрами."
            : "Не найдены ID объявлений Encar.",
          ids: [],
        },
        { status: 422 }
      )
    }
    return NextResponse.json({ ids, query, count: ids.length })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось получить список Encar" },
      { status: 500 }
    )
  }
}
