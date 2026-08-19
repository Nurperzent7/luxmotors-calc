import translate from "google-translate-api-x"
import * as cheerio from "cheerio"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { isHeyDealerUrl, parseHeyDealerUrl } from "@/lib/heydealer"
import { isKbChachachaUrl, parseKbChachachaUrl } from "@/lib/kbchachacha"
import { getFirstRegFeeKzt, getUtilFeeKzt } from "@/lib/fees"
import { extractEncarVehicleId, fetchEncarBodyDamage, fetchEncarInsuranceHistory } from "@/lib/encar-inspection"
import { classifyEncarVehicle, classifyFromSavePayload, type EncarCatalogClass } from "@/lib/special-vehicle"

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

function getCustomsPrice(
  title: string,
  engine: number,
  year: number,
  usdKztRate = 467
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

    const parseExcelYear = (value: unknown): number => {
      if (typeof value === "number" && Number.isFinite(value)) return value
      const text = String(value || "")
      const match = text.match(/(19|20)\d{2}/)
      return match ? Number(match[0]) : NaN
    }

    // Основной лист «Авто» + лист для авто 2015 и старше
    const sheetNames = workbook.SheetNames.filter((name) => {
      const n = name.toLowerCase()
      return n.includes("авто") && !n.includes("мото") && !n.includes("квадро") && !n.includes("грузов")
    })
    const namesToUse = sheetNames.length > 0 ? sheetNames : [workbook.SheetNames[0]]

    const data: any[] = []
    for (const name of namesToUse) {
      const sheet = workbook.Sheets[name]
      if (!sheet) continue
      const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { header: "A" })
      for (const row of rawData.slice(1)) {
        if (!row?.["B"] && !row?.["C"]) continue
        data.push({
          ...row,
          E: parseExcelYear(row["E"]),
          _sheet: name,
        })
      }
    }

    console.log({ customsSheets: namesToUse, customsRows: data.length, sample: data[0] })

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
    const commonWords = new Set([
      "M", "SPORT", "COMPETITION", "XDRIVE", "SDRIVE", "PACKAGE", "EDITION",
      "LINE", "STYLE", "LUXURY", "EXCLUSIVE", "PREMIUM", "CLASSIC", "MODERN",
      "LPG", "HYBRID", "ELECTRIC", "TURBO", "AUTO", "MANUAL",
    ])

    const tokenize = (value: string) =>
      value
        .toUpperCase()
        .match(/[A-Z0-9]+/g)
        ?.filter((w) => !commonWords.has(w) && w.length > 1) || []

    const titleWords = tokenize(normalizedTitle)
    const titleWordSet = new Set(titleWords)

    // Если в названии есть марка из таблицы — ищем только среди этой марки
    const brandsInTable = [
      ...new Set(
        data
          .map((row) =>
            String(row["B"] || "")
              .toUpperCase()
              .replace(/[^A-Z0-9 ]/g, " ")
              .trim()
          )
          .filter(Boolean)
      ),
    ].sort((a, b) => b.length - a.length)

    const detectedBrand =
      brandsInTable.find(
        (brand) => titleWordSet.has(brand) || normalizedTitle.includes(brand)
      ) || null

    let bestRow: any = null
    let bestScore = 0

    for (const row of data) {
      const brand = String(row["B"] || "")
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .trim()
      const model = String(row["C"] || "")
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .trim()

      if (detectedBrand && brand !== detectedBrand) continue

      const rowWords = tokenize(model)
      if (rowWords.length === 0) continue

      const rowEngine = Number(row["D"])
      const rowYear = Number(row["E"])
      if (!Number.isFinite(rowYear)) continue
      let score = 0
      let exactModelHits = 0

      // Только точное совпадение токенов — иначе GRAN матчит GRANDEUR
      for (const word of rowWords) {
        if (titleWordSet.has(word)) {
          exactModelHits++
          score += 8 + Math.min(word.length, 10)
        }
      }

      // Без совпадения имени модели строку не берём (объём/год сами по себе недостаточны)
      if (exactModelHits === 0) continue

      // Все значимые слова модели есть в названии — сильный бонус
      if (exactModelHits === rowWords.length) {
        score += 25
      }

      if (brand && (titleWordSet.has(brand) || normalizedTitle.includes(brand))) {
        score += 20
      } else if (!detectedBrand) {
        // Марки в title нет — лёгкий штраф, чтобы не путать одноимённые модели разных брендов без нужды
        score -= 2
      }

      if (Number.isFinite(rowEngine) && rowEngine === engineCC) {
        score += 12
      } else if (Number.isFinite(rowEngine) && Math.abs(rowEngine - engineCC) <= 200) {
        score += 4
      }

      if (rowYear === year) {
        score += 6
      } else {
        const yearDiff = Math.abs(rowYear - year)
        if (yearDiff <= 2) score += 3
        else if (yearDiff <= 5) score += 1
      }

      // Для авто 2015 и старше — небольшой приоритет листа «с 2015г. и ранее»
      if (year <= 2015 && String(row._sheet || "").includes("2015")) {
        score += 8
      }

      if (expectedSeries) {
        const modelStr = String(row["C"] || "").toUpperCase()
        const modelSeriesMatch = modelStr.match(/(\d+)-?SERIES/)
        if (modelSeriesMatch && modelSeriesMatch[1] === expectedSeries) {
          score += 15
        }
        if (expectedSeries.startsWith("X") && modelStr.includes(`BMW ${expectedSeries}`)) {
          score += 15
        }
      }

      // При равном score предпочитаем ближе по году/объёму
      const betterTieBreak =
        bestRow &&
        score === bestScore &&
        (
          Math.abs(rowYear - year) < Math.abs(Number(bestRow["E"]) - year) ||
          (
            Math.abs(rowYear - year) === Math.abs(Number(bestRow["E"]) - year) &&
            Math.abs(rowEngine - engineCC) < Math.abs(Number(bestRow["D"]) - engineCC)
          )
        )

      if (score > bestScore || betterTieBreak) {
        bestScore = score
        bestRow = row
      }
    }

    const foundRow = bestScore >= 8 ? bestRow : null

    console.log({
      normalizedTitle,
      detectedBrand,
      bestScore,
      foundModel: foundRow?.["C"],
      foundBrand: foundRow?.["B"],
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
      price: Math.round(usd * usdKztRate),
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

    const usdKztRate =
      Number(body?.usdKztRate || body?.usdRate || 467) || 467

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
    let source: "encar" | "heydealer" | "kbchachacha" = "encar"
    let bodyDamage: Array<{ part: string; status: string }> = []
    let insuranceRecords: Array<{ date: string; type: string; amount: number; description: string }> = []
    let insuranceSummary: Record<string, unknown> = {}
    let inspectionMeta: Record<string, unknown> = {}
    let encarVehicleId: string | null = null
    let catalogClass: EncarCatalogClass = { vehicleType: "CAR" }

    if (isKbChachachaUrl(url)) {
      const kb = await parseKbChachachaUrl(url)
      try {
        const translated = await translate(kb.title, { from: "ko", to: "en" })
        title = String(translated.text || kb.title).trim()
      } catch {
        title = kb.title
      }
      year = kb.year
      mileage = kb.mileage
      krw = kb.krw
      finalImages = kb.images
      source = "kbchachacha"
    } else if (isHeyDealerUrl(url)) {
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

      // Уникальные фото Encar: один кадр = один ключ, берём лучшее качество
      const imageByKey = new Map<string, string>()

      const normalizeImageUrl = (src: string) => {
        let fullUrl = src.startsWith("http")
          ? src
          : src.startsWith("//")
            ? `https:${src}`
            : src
        fullUrl = fullUrl.replace(/&amp;/g, "&").trim()
        return fullUrl
      }

      const photoKey = (url: string) => {
        const match = url.match(/(\d+_\d+)\.(jpg|jpeg|png|webp)/i)
        if (match) return match[1].toLowerCase()
        return url.split("?")[0].toLowerCase()
      }

      const qualityScore = (url: string) => {
        let score = 0
        const rh = Number(url.match(/[?&]rh=(\d+)/i)?.[1] || 0)
        const cw = Number(url.match(/[?&]cw=(\d+)/i)?.[1] || 0)
        score += rh + cw
        if (/[?&]t=\d+/i.test(url)) score += 50
        if (!url.includes("wtmk")) score += 10
        return score
      }

      const addImage = (src?: string | null) => {
        if (!src) return
        const fullUrl = normalizeImageUrl(src)
        const valid =
          (fullUrl.includes(".jpg") ||
            fullUrl.includes(".jpeg") ||
            fullUrl.includes(".png") ||
            fullUrl.includes(".webp")) &&
          fullUrl.includes("carpicture") &&
          !fullUrl.includes("logo") &&
          !fullUrl.includes("icon") &&
          !fullUrl.includes("banner") &&
          !fullUrl.includes("blank")

        if (!valid) return

        const key = photoKey(fullUrl)
        const prev = imageByKey.get(key)
        if (!prev || qualityScore(fullUrl) > qualityScore(prev)) {
          imageByKey.set(key, fullUrl)
        }
      }

      $("img").each((_, el) => {
        addImage($(el).attr("src"))
        addImage($(el).attr("data-src"))
        addImage($(el).attr("data-original"))
        addImage($(el).attr("data-lazy"))
      })

      const bgMatches =
        html.match(/https?:\/\/[^"' )\]]+\.(jpg|jpeg|png|webp)[^"' )\]]*/gi) || []
      bgMatches.forEach((img) => addImage(img))

      const jsonMatches =
        html.match(/https?:\\\/\\\/ci\.encar\.com\\\/carpicture[^"'\\\s]+/gi) || []
      jsonMatches.forEach((raw) => {
        addImage(raw.replace(/\\\//g, "/").replace(/\\u0026/g, "&"))
      })

      finalImages = Array.from(imageByKey.values())
        .sort((a, b) => {
          const numA = Number(a.match(/_(\d+)\.(jpg|jpeg|png|webp)/i)?.[1] || 0)
          const numB = Number(b.match(/_(\d+)\.(jpg|jpeg|png|webp)/i)?.[1] || 0)
          return numA - numB
        })
        .slice(0, 20)

      encarVehicleId = extractEncarVehicleId(String(url))
      if (encarVehicleId) {
        try {
          const insp = await fetchEncarBodyDamage(encarVehicleId)
          bodyDamage = insp.bodyDamage
          inspectionMeta = insp.inspectionMeta as Record<string, unknown>
        } catch (e) {
          console.warn("[encar-inspection]", e)
        }
        try {
          const hist = await fetchEncarInsuranceHistory(encarVehicleId)
          insuranceRecords = hist.insuranceRecords
          insuranceSummary = hist.insuranceSummary as Record<string, unknown>
        } catch (e) {
          console.warn("[encar-insurance]", e)
        }
        try {
          const vehRes = await fetch(`https://api.encar.com/v1/readside/vehicle/${encarVehicleId}`, {
            headers: {
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0",
              Referer: `https://fem.encar.com/cars/detail/${encarVehicleId}`,
            },
            cache: "no-store",
          })
          if (vehRes.ok) {
            catalogClass = classifyEncarVehicle(await vehRes.json())
          }
        } catch (e) {
          console.warn("[encar-type]", e)
        }
      }
    }

    if (catalogClass.vehicleType !== "SPECIAL") {
      catalogClass = classifyFromSavePayload({
        vehicleType: catalogClass.vehicleType,
        title,
        sourceUrl: url,
      })
    }

    const carPriceKzt = Math.round(krw * 0.36)
    const engine = selectedEngine

    const logistics =
      1150000

    const recycle = getUtilFeeKzt(engine)

    const primary = getFirstRegFeeKzt(year)

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
        year,
        usdKztRate
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
              finalPriceUsd: Math.round(customs.price / usdKztRate),
            }
          : null,
      recycle: recycle.toLocaleString() + " ₸",
      primary: primary.toLocaleString() + " ₸",
      excise: excise.toLocaleString() + " ₸",
      broker: broker.toLocaleString() + " ₸",
      finalTotal: total.toLocaleString() + " ₸",
      images: finalImages,
      bodyDamage,
      insuranceRecords,
      insuranceSummary,
      inspectionMeta,
      encarVehicleId,
      vehicleType: catalogClass.vehicleType,
      bodyType: catalogClass.bodyType,
      fuel: catalogClass.fuel,
      transmission: catalogClass.transmission,
      loadCapacity: catalogClass.loadCapacity,
    })
  } catch (error) {
    console.log(error)

    const message =
      error instanceof Error ? error.message : "Parse error"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}