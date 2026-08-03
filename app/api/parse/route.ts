import translate from "google-translate-api-x"
import * as cheerio from "cheerio"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { isHeyDealerUrl, parseHeyDealerUrl } from "@/lib/heydealer"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

function getCustomsPrice(
  title: string,
  engine: number,
  year: number
): { price: number; excelYear?: number; carYear?: number; depreciationYears?: number; originalUsd?: number; foundModel?: string } {


  const filePath =
    process.env.CUSTOMS_XLSX_PATH ||
    path.join(
      process.cwd(),
      "public",
      "customs.xlsx"
    )

  if (!fs.existsSync(filePath)) {
    console.warn(
      "[customs] File not found:",
      filePath,
      "— set CUSTOMS_XLSX_PATH or add public/customs.xlsx (таможня = 0)."
    )
    return { price: 0 }
  }

  try {
    const buf = fs.readFileSync(filePath)
    const workbook = XLSX.read(buf, { type: "buffer" })

    const sheet =
      workbook.Sheets[workbook.SheetNames[0]]

      const rawData: any[] =
  XLSX.utils.sheet_to_json(sheet, {
    header: "A",
  })

const data = rawData.slice(1)
      console.log(data[0])

      const normalizedTitle = title
  .toUpperCase()
  .replace(/SELL MY CAR/gi, "")
  .replace(/BUY MY CAR/gi, "")
  .replace(/USED CAR/gi, "")
  .replace(/SEOUL/gi, "")
  .replace(/GYEONGGI/gi, "")
  .replace(/[^A-Z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim()

    const engineCC = Math.round(engine * 1000)


    // Определяем серию BMW по кузову
    const bmwSeriesMatch = normalizedTitle.match(/(\d+)\s+SERIES/i)
    const bmwChassisMatch = normalizedTitle.match(/\(([GEF]\d{2})\)/i)
    const bmwChassis = bmwChassisMatch ? bmwChassisMatch[1] : null
    
    // Карта кузовов BMW к сериям
    const bmwChassisToSeries: Record<string, string> = {
      'G30': '5', 'G31': '5', 'G38': '5',
      'G20': '3', 'G21': '3', 'G28': '3',
      'G11': '7', 'G12': '7',
      'G01': 'X3', 'G02': 'X4', 'G05': 'X5', 'G06': 'X6', 'G07': 'X7',
      'F30': '3', 'F31': '3', 'F34': '3', 'F35': '3',
      'F10': '5', 'F11': '5', 'F18': '5',
      'E90': '3', 'E91': '3', 'E92': '3', 'E93': '3',
    }
    
    let expectedSeries = bmwSeriesMatch ? bmwSeriesMatch[1] : 
                         (bmwChassis && bmwChassisToSeries[bmwChassis] ? bmwChassisToSeries[bmwChassis] : null)
    
    // Если нашли серию через "5 SERIES", убедимся что это не число из "530i"
    // Проверяем что кузов соответствует (G30 для 5-series и т.д.)
    if (bmwChassis && expectedSeries && bmwChassisToSeries[bmwChassis] !== expectedSeries) {
      // Если есть расхождение, используем серию по кузову (она точнее)
      expectedSeries = bmwChassisToSeries[bmwChassis]
    }
    
    console.log({ bmwChassis, expectedSeries, title: normalizedTitle })

    // Игнорируем общие слова при поиске
    const commonWords = ['M', 'SPORT', 'COMPETITION', 'XDRIVE', 'SDRIVE', 'PACKAGE', 'EDITION', 'LINE', 'STYLE', 'LUXURY']
    
    const titleWords =
    normalizedTitle
    .toUpperCase()
    .match(/[A-Z0-9]+/g)
    ?.filter(w => !commonWords.includes(w) && w.length > 1) || []

let bestRow = null
let bestScore = 0

for (const row of data) {

  const model =
  String(row["C"] || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")

    const rowWords =
    model.match(/[A-Z0-9]+/g)
    ?.filter(w => !commonWords.includes(w) && w.length > 1) || []

  const rowEngine =
    Number(row["D"])

    let score = 0

    for (const word of rowWords) {
    
      if (
        titleWords.some((t) => t.includes(word))
      ) {
        score += 3
      }
    }

  // бонус за объем (важный фактор!)
  if (rowEngine === engineCC) {
    score += 10
  }
  
  const rowYear =
    Number(row["E"])
  
  if (rowYear === year) {
    score ++
  }

  // Бонус если серия совпадает
  if (expectedSeries) {
    const modelStr = String(row["C"] || "").toUpperCase()
    // Проверяем что серия в модели совпадает (5-SERIES, 3-SERIES и т.д.)
    const modelSeriesMatch = modelStr.match(/(\d+)-?SERIES/)
    if (modelSeriesMatch && modelSeriesMatch[1] === expectedSeries) {
      score += 15  // Большой бонус за совпадение серии
    }
    // Или для X-моделей
    if (expectedSeries.startsWith('X') && modelStr.includes(`BMW ${expectedSeries}`)) {
      score += 15
    }
  }

  if (score > bestScore) {
    bestScore = score
    bestRow = row
  }
}

const foundRow =
  bestScore >= 3
    ? bestRow
    : null

console.log({
  normalizedTitle,
  bestScore,
  foundModel: foundRow?.["C"],
})
    if (!foundRow) {
      console.log("NOT FOUND:", title)
      return { price: 0 }
    }

    const excelYear = Number(foundRow["E"])
    const carYear = year

    let originalUsd = Number(
      String(foundRow["F"] || "0")
        .replace(/\s/g, "")
        .replace(",", "")
    )
    
    let usd = originalUsd
    let depreciationYears = 0
    
    console.log({
      excelPrice: foundRow["F"],
      usd,
    })
    
    let currentYear = excelYear
    while (currentYear > carYear) {
      usd *= 0.85
      currentYear--
      depreciationYears++
    }

    return { 
      price: Math.round(usd * 520),
      excelYear,
      carYear,
      depreciationYears,
      originalUsd,
      foundModel: foundRow["C"]
    }
  } catch (e) {
    console.error("[customs] Failed to read or parse xlsx:", e)
    return { price: 0 }
  }
}

export async function POST(req: Request) {

  try {

    const body =
      await req.json()

    const url =
      body?.url

    const selectedEngine =
      Number(body?.engine || 2)

    if (!url) {
      return NextResponse.json(
        { error: "Нет ссылки" },
        { status: 400 }
      )
    }

    let title = ""
    let year = 2020
    let mileage = "Unknown"
    let krw = 0
    let finalImages: string[] = []
    let source: "encar" | "heydealer" = "encar"

    if (isHeyDealerUrl(url)) {
      const heydealer = await parseHeyDealerUrl(url)
      title = heydealer.title
      year = heydealer.year
      mileage = heydealer.mileage
      krw = heydealer.krw
      finalImages = heydealer.images
      source = "heydealer"
    } else {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      })

      const html = await response.text()
      const $ = cheerio.load(html)

      const rawTitle =
        $("meta[property='og:title']").attr("content") ||
        $("title").text()

      const translated = await translate(rawTitle, {
        from: "ko",
        to: "en",
      })

      title = translated.text
        .replace(/Gyeonggi Used Car.*/i, "")
        .replace(/Sell My Car/gi, "")
        .replace(/Buy My Car/gi, "")
        .replace(/Used Car/gi, "")
        .trim()

      const pageText = $("body").text()
      const priceMatch = pageText.match(/([\d,]+)\s*만원/)

      if (priceMatch) {
        krw =
          Number(priceMatch[1].replace(/,/g, "")) * 10000
      }

      const mileageMatch = pageText.match(/\b[\d,]+\s?km\b/i)
      mileage = mileageMatch ? mileageMatch[0] : "Unknown"

      const yearMatch = pageText.match(/\d{2}\/\d{2}식/)
      year = 2020

      if (yearMatch) {
        const shortYear = Number(yearMatch[0].split("/")[0])
        year = shortYear >= 30 ? 1900 + shortYear : 2000 + shortYear
      }

      const images = new Set<string>()

      $("img").each((_, el) => {
        const sources = [
          $(el).attr("src"),
          $(el).attr("data-src"),
          $(el).attr("data-original"),
          $(el).attr("data-lazy"),
        ]

        sources.forEach((src) => {
          if (!src) return

          const fullUrl = src.startsWith("http") ? src : `https:${src}`
          const valid =
            (fullUrl.includes(".jpg") ||
              fullUrl.includes(".jpeg") ||
              fullUrl.includes(".png") ||
              fullUrl.includes(".webp")) &&
            !fullUrl.includes("logo") &&
            !fullUrl.includes("icon") &&
            !fullUrl.includes("banner") &&
            !fullUrl.includes("blank")

          if (valid) images.add(fullUrl)
        })
      })

      const bgMatches =
        html.match(/https?:\/\/[^"' )]+\.(jpg|jpeg|png|webp)/gi) || []

      bgMatches.forEach((img) => {
        const valid =
          !img.includes("logo") &&
          !img.includes("icon") &&
          !img.includes("banner") &&
          !img.includes("blank")

        if (valid) images.add(img)
      })

      finalImages = Array.from(images)
        .sort((a, b) => {
          const numA = Number(a.match(/_(\d+)\.(jpg|jpeg|png|webp)/i)?.[1] || 0)
          const numB = Number(b.match(/_(\d+)\.(jpg|jpeg|png|webp)/i)?.[1] || 0)
          return numA - numB
        })
        .slice(0, 50)
    }

    const carPriceKzt = Math.round(krw * 0.36)
    const engine = selectedEngine

    const logistics =
      1150000

    let recycle = 324000

    if (engine > 1 && engine <= 2)
      recycle = 757000

    if (engine > 2 && engine <= 3)
      recycle = 1080000

    if (engine > 3)
      recycle = 2490000

    const currentYear = 2026

    const age =
      currentYear - year

    const primary =
      age <= 2
        ? 1081
        : 2162500

    let excise = 0

    if (engine >= 3) {
      excise =
        Math.round(engine * 100000)
    }

    const broker =
      500000

    const customs =
      getCustomsPrice(
        title,
        engine,
        year
      )
      console.log("CUSTOMS RESULT:", customs)
      
    const customsKzt = customs.price

    const total =
      carPriceKzt +
      logistics +
      customs.price +
      recycle +
      primary +
      excise +
      broker

    return NextResponse.json({
      source,
      title,
      year,
      engine: `${engine.toFixed(1)} л`,
      mileage,
      price: krw.toLocaleString() + " ₩",
      priceKzt: carPriceKzt.toLocaleString() + " ₸",
      logistics: logistics.toLocaleString() + " ₸",
      customs: customsKzt.toLocaleString() + " ₸",
      customsDetails:
        customs.price > 0
          ? {
              foundModel: customs.foundModel,
              excelYear: customs.excelYear,
              carYear: customs.carYear,
              originalPrice: customs.originalUsd,
              depreciationYears: customs.depreciationYears || 0,
              depreciationPercent:
                (customs.depreciationYears || 0) > 0
                  ? `${(Math.pow(0.85, customs.depreciationYears || 0) * 100).toFixed(1)}%`
                  : "100%",
              finalPriceUsd: Math.round(customs.price / 520),
            }
          : null,
      recycle: recycle.toLocaleString() + " ₸",
      primary: primary.toLocaleString() + " ₸",
      excise: excise.toLocaleString() + " ₸",
      broker: broker.toLocaleString() + " ₸",
      finalTotal: total.toLocaleString() + " ₸",
      images: finalImages,
    })
  } catch (error) {
    console.log(error)

    const message =
      error instanceof Error ? error.message : "Parse error"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}