"use client"

import { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Globe2,
  Truck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { extractEncarVehicleIds, isEncarSearchUrl } from "@/lib/encar-list"
import { DELIVERY_BY_AGREEMENT, deliveryUsdByKrw, isDeliveryByAgreement } from "@/lib/delivery"

const WHATSAPP_URL =
  "https://wa.me/821021846777?text=" +
  encodeURIComponent("Здравствуйте! Хочу узнать цену под ключ.")

type CarResult = {
  title: string
  year: string | number
  mileage: string
  price: string
  priceKrw: number
  images?: string[]
  carPriceUsd: number
  carPriceKzt: number
  logisticsUsd: number
  logistics: number
  serviceFeeUsd: number
  serviceFee: number
  almatyTotal: number
  selectedEngine: string
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
}

/** Always visible on first paint — whileInView in iframe leaves opacity:0 forever */
const fadeInView = {
  initial: "show" as const,
  animate: "show" as const,
  variants: fadeUp,
  transition: { duration: 0.35 },
}

const formatKzt = (value: number) =>
  `${new Intl.NumberFormat("ru-RU").format(value)} ₸`

const formatKrw = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)} ₩`

function logisticsLabel(car: CarResult) {
  if (isDeliveryByAgreement(car.priceKrw)) return DELIVERY_BY_AGREEMENT
  return formatKzt(car.logistics)
}

export default function Home() {
  // Always false on first render (SSR + hydrate) to avoid mismatched DOM / dead clicks in iframe
  const [embed, setEmbed] = useState(false)
  const [url, setUrl] = useState("")
  const [heydealerUrl, setHeydealerUrl] = useState("")
  const [engine, setEngine] = useState("2.0")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeImage, setActiveImage] = useState(0)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const thumbsDrag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 })
  const [car, setCar] = useState<CarResult | null>(null)

  const [usdKztRate, setUsdKztRate] = useState(467)
  const [krwUsdRate, setKrwUsdRate] = useState(1380)
  const [deliveryUsd, setDeliveryUsd] = useState(2000)
  const [catalogSave, setCatalogSave] = useState<"idle" | "saving" | "ok" | "error">("idle")
  const [catalogSaveMsg, setCatalogSaveMsg] = useState("")
  const [batchProgress, setBatchProgress] = useState("")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let inIframe = false
    try {
      inIframe = window.self !== window.top
    } catch {
      inIframe = true
    }
    const nextEmbed = params.get("embed") === "1" || inIframe
    setEmbed(nextEmbed)
    if (nextEmbed) {
      document.documentElement.setAttribute("data-embed", "1")
    }
  }, [])

  useEffect(() => {
    const el = thumbsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY + e.deltaX
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [car])

  const importOneEncar = async (vehicleId: string) => {
    const saveRes = await fetch("/api/import-encar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        usdKztRate,
        krwUsdRate,
        deliveryUsd,
      }),
    })
    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      throw new Error(
        typeof saveData?.error === "string" ? saveData.error : `Не удалось сохранить (${saveRes.status})`
      )
    }
    return saveData
  }

  const handleBatchEncarImport = async (ids: string[]) => {
    setLoading(true)
    setCatalogSave("saving")
    setCatalogSaveMsg("")
    let ok = 0
    let failed = 0
    let lastCar: CarResult | null = null
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        setBatchProgress(`Загружаем ${i + 1} из ${ids.length}…`)
        try {
          const saveData = await importOneEncar(id)
          if (saveData?.skipped) {
            failed += 1
            continue
          }
          ok += 1
          if (saveData?.car) {
            lastCar = {
              title: saveData.car.title,
              year: saveData.car.year,
              mileage: saveData.car.mileage,
              price: formatKrw(saveData.car.priceKrw),
              priceKrw: saveData.car.priceKrw,
              images: saveData.car.images,
              carPriceUsd: saveData.car.carPriceUsd,
              carPriceKzt: saveData.car.carPriceKzt,
              logisticsUsd: saveData.car.logisticsUsd,
              logistics: saveData.car.logistics,
              serviceFeeUsd: 0,
              serviceFee: 0,
              almatyTotal: saveData.car.almatyTotal,
              selectedEngine: saveData.car.selectedEngine,
            }
          }
        } catch {
          failed += 1
        }
      }
      if (lastCar) {
        setCar(lastCar)
        setActiveImage(0)
      }
      if (ok === 0) {
        setCatalogSave("error")
        setCatalogSaveMsg("Не удалось загрузить авто в каталог")
        setError("Проверьте ссылки Encar и попробуйте ещё раз.")
      } else {
        setCatalogSave("ok")
        setCatalogSaveMsg(
          failed > 0
            ? `В каталог загружено ${ok} из ${ids.length} (ошибок: ${failed})`
            : `В каталог загружено ${ok} авто с Encar`
        )
      }
    } finally {
      setBatchProgress("")
      setLoading(false)
    }
  }

  const handleCalculate = async () => {
    setError("")
    const encarLink = url.trim()
    const heydealerLink = heydealerUrl.trim()

    if (!encarLink && !heydealerLink) {
      setError("Введите ссылку Encar или KB CHACHACHA.")
      return
    }

    const pastedIds = extractEncarVehicleIds(encarLink)
    if (!heydealerLink && (isEncarSearchUrl(encarLink) || pastedIds.length > 1)) {
      try {
        setLoading(true)
        setCatalogSave("saving")
        setBatchProgress("Собираем объявления Encar…")
        const idsRes = await fetch("/api/encar-ids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: encarLink, limit: 10 }),
        })
        const idsData = await idsRes.json().catch(() => ({}))
        const ids: string[] = Array.isArray(idsData?.ids) ? idsData.ids : pastedIds
        if (!ids.length) {
          setLoading(false)
          setCatalogSave("idle")
          setBatchProgress("")
          setError(idsData?.error || "Не найдены объявления Encar.")
          return
        }
        await handleBatchEncarImport(ids)
      } catch {
        setLoading(false)
        setCatalogSave("error")
        setBatchProgress("")
        setError("Не удалось получить список с Encar.")
      }
      return
    }

    if (encarLink && heydealerLink) {
      setError("Введите только одну ссылку — Encar или KB CHACHACHA.")
      return
    }

    const targetUrl = heydealerLink || encarLink

    if (encarLink && !encarLink.includes("encar.com")) {
      setError("Введите корректную ссылку Encar.")
      return
    }

    if (
      heydealerLink &&
      !heydealerLink.includes("kbchachacha.com") &&
      !heydealerLink.includes("heydealer.com") &&
      !heydealerLink.startsWith("heydealer://")
    ) {
      setError("Введите корректную ссылку KB CHACHACHA (или HeyDealer).")
      return
    }

    try {
      setLoading(true)
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, engine, usdKztRate }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "Ошибка расчета")

      const krwPrice = Number(String(data.price || "").replace(/[^\d]/g, "")) || 0
      const autoDelivery = deliveryUsdByKrw(krwPrice)
      const logisticsUsd = autoDelivery ?? 0
      const carPriceUsd = Math.round(krwPrice / krwUsdRate)
      const carPriceKzt = Math.round(carPriceUsd * usdKztRate)
      const logistics = Math.round(logisticsUsd * usdKztRate)
      const serviceFee = 0
      const serviceFeeUsd = 0
      const almatyTotal = carPriceKzt + logistics

      const cleanTitle = (data.title || "Автомобиль из Кореи")
        .replace(/Sell My Car/gi, "")
        .replace(/Buy My Car/gi, "")
        .replace(/Used Car/gi, "")
        .replace(/\s+/g, " ")
        .replace(/[,:]+$/, "")
        .trim()

      setCar({
        title: cleanTitle,
        year: data.year || "Unknown",
        mileage: data.mileage || "Unknown",
        price: formatKrw(krwPrice),
        priceKrw: krwPrice,
        images: Array.isArray(data.images) ? data.images : [],
        carPriceUsd,
        carPriceKzt,
        logisticsUsd,
        logistics,
        serviceFeeUsd,
        serviceFee,
        almatyTotal,
        selectedEngine: `${engine} л`,
      })
      setActiveImage(0)
      if (autoDelivery === null) {
        setCatalogSave("idle")
        setCatalogSaveMsg("")
        setError("Цена ниже 5 млн ₩ — в каталог не сохраняем.")
        return
      }
      setDeliveryUsd(autoDelivery)
      setCatalogSave("saving")
      setCatalogSaveMsg("")

      // Автосохранение в каталог (только до Алматы; под ключ — через WhatsApp)
      try {
        const saveRes = await fetch("/api/save-to-catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: targetUrl,
            title: cleanTitle,
            year: data.year || new Date().getFullYear(),
            mileage: data.mileage || "",
            price: formatKrw(krwPrice),
            priceKRW: krwPrice,
            priceUsd: carPriceUsd,
            images: Array.isArray(data.images) ? data.images : [],
            selectedEngine: `${engine} л`,
            almatyPriceKzt: almatyTotal,
            priceDelivery: almatyTotal,
            total: 0,
            serviceFee,
            logistics,
            logisticsUsd,
            carPriceKzt,
            usdKztRate,
            bodyDamage: Array.isArray(data.bodyDamage) ? data.bodyDamage : [],
            insuranceRecords: Array.isArray(data.insuranceRecords) ? data.insuranceRecords : [],
            insuranceSummary: data.insuranceSummary || null,
            vehicleType: data.vehicleType,
            bodyType: data.bodyType,
            fuel: data.fuel,
            transmission: data.transmission,
            loadCapacity: data.loadCapacity,
          }),
        })
        const saveData = await saveRes.json().catch(() => ({}))
        if (!saveRes.ok) {
          setCatalogSave("error")
          setCatalogSaveMsg(
            typeof saveData?.error === "string"
              ? saveData.error
              : `Не удалось сохранить в каталог (${saveRes.status})`
          )
        } else if (saveData?.skipped) {
          setCatalogSave("idle")
          setCatalogSaveMsg("")
        } else {
          setCatalogSave("ok")
          setCatalogSaveMsg("Авто сохранено в каталог")
        }
      } catch {
        setCatalogSave("error")
        setCatalogSaveMsg("Ошибка сети при сохранении в каталог")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить расчет")
    } finally {
      setLoading(false)
    }
  }

  const downloadCarData = async () => {
    if (!car) return
    const element = document.getElementById("car-pdf-content")
    if (!element) return

    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      })

      const link = document.createElement("a")
      link.download = `${car.title.replace(/\s+/g, "_")}_specs.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } catch (err) {
      console.error("Image generation failed:", err)
      alert("Не удалось создать изображение. Попробуйте еще раз.")
    }
  }

  const images = car?.images?.length
    ? car.images
    : ["https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=1200&auto=format&fit=crop"]

  return (
    <main className={`relative overflow-x-hidden bg-[#F7F7F8] text-zinc-900 ${embed ? "embed-mode min-h-0" : "min-h-screen"}`}>
      {!embed && (
        <div className="marketing-block pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,_rgba(201,12,7,0.12),_transparent_60%)]" />
      )}
      <div className={`relative mx-auto w-full max-w-7xl px-4 md:px-8 lg:px-12 ${embed ? "pb-4 pt-2" : "pb-16 pt-6"}`}>
        {!embed && (
        <header className="mb-6 flex items-center marketing-block">
          <img
            src="/logo.png"
            alt="Lux Motors — Export from Korea"
            className="h-14 w-auto object-contain md:h-16"
          />
        </header>
        )}

        {!embed && (
        <section
          className="marketing-block grid items-center gap-10 py-10 md:grid-cols-2 md:py-16"
        >
          <div className="space-y-6">
            <h1 className="text-balance text-5xl font-bold leading-tight text-[#C90C07] md:text-7xl">
              LUX MOTORS
            </h1>
            <h2 className="text-balance text-2xl font-semibold leading-tight text-zinc-800 md:text-3xl">
              Импорт авто из Кореи в Казахстан
            </h2>
            <p className="max-w-xl text-zinc-600 md:text-lg">
              Моментальный расчёт до Алматы: Encar или KB CHACHACHA — цена авто и логистика.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth" })}>
                Рассчитать стоимость <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="ghost" onClick={() => window.open("https://wa.me/821021846777", "_blank")}>
                WhatsApp
              </Button>
              <Button variant="ghost" onClick={() => window.open("https://instagram.com/lux_motors_adal", "_blank")}>
                Instagram
              </Button>
              <Button variant="ghost" onClick={() => window.open("mailto:zhaksyba.kuanysh@icloud.com", "_blank")}>
                Email
              </Button>
            </div>
          </div>
          <Card className="relative overflow-hidden bg-white">
            <img
              src="/logo.png"
              alt="Lux Motors"
              className="h-[340px] w-full object-contain md:h-[430px]"
            />
          </Card>
        </section>
        )}

        <section id="calculator" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div {...fadeInView}>
            <Card>
              <CardContent className="space-y-4 p-6 md:p-8">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-2xl font-semibold md:text-3xl">Калькулятор стоимости</h2>
                  <Badge className="border-[#C90C07]/20 bg-[#C90C07]/10 text-[#C90C07]">Live Estimate</Badge>
                </div>
                <textarea
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  rows={3}
                  placeholder="Ссылка Encar на карточку, поиск, или несколько ссылок сразу"
                  className="flex min-h-[84px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-all focus:border-[#C90C07]/50 focus:ring-2 focus:ring-[#C90C07]/15"
                />
                <p className="text-xs text-zinc-500">
                  Карточка — расчёт и сохранение. Поиск Encar или несколько ссылок — загрузка в каталог через калькулятор.
                </p>
                <Input
                  value={heydealerUrl}
                  onChange={(e) => setHeydealerUrl(e.target.value)}
                  placeholder="Вставьте ссылку KB CHACHACHA"
                />
                <Select value={engine} onChange={(e) => setEngine(e.target.value)}>
                  {["1.0", "1.3", "1.5", "1.6", "2.0", "2.2", "2.4", "2.5", "3.0", "3.3", "3.5", "3.6", "3.8", "4.0", "4.4", "5.0", "5.5", "6.0", "6.2"].map((item) => (
                    <option key={item} value={item}>{item} л</option>
                  ))}
                </Select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500">Курс USD → KZT</label>
                    <Input
                      type="number"
                      value={usdKztRate}
                      onChange={(e) => setUsdKztRate(Number(e.target.value))}
                      placeholder="467"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Курс KRW → USD</label>
                    <Input
                      type="number"
                      value={krwUsdRate}
                      onChange={(e) => setKrwUsdRate(Number(e.target.value))}
                      placeholder="1380"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-500">Доставка до Алматы</label>
                  <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                    5–30 млн ₩ → $1650 · 30–40 млн ₩ → $1000 · от 40 млн ₩ → По договоренности
                  </p>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}
                {catalogSave === "saving" && (
                  <p className="text-sm text-zinc-500">{batchProgress || "Сохраняем в каталог…"}</p>
                )}
                {catalogSave === "ok" && (
                  <p className="text-sm text-emerald-600">{catalogSaveMsg}</p>
                )}
                {catalogSave === "error" && (
                  <p className="text-sm text-red-600">{catalogSaveMsg}</p>
                )}
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    void handleCalculate()
                  }}
                  disabled={loading}
                >
                  {loading
                    ? batchProgress || "Считаем..."
                    : isEncarSearchUrl(url) || extractEncarVehicleIds(url).length > 1
                      ? "Загрузить в каталог"
                      : "Рассчитать"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.aside {...fadeInView}>
            <Card className="sticky top-6">
              <CardContent className="space-y-4 p-6">
                <p className="text-sm uppercase tracking-wide text-zinc-500">Цена до Алматы</p>
                <div className="space-y-3 text-sm text-zinc-600">
                  {car ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <span>Авто:</span>
                        <span className="text-right font-medium text-zinc-900">
                          {car.price}
                          <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                            ${new Intl.NumberFormat("en-US").format(car.carPriceUsd)} · {formatKzt(car.carPriceKzt)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Логистика:</span>
                        <span className="font-medium text-zinc-900">{logisticsLabel(car)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-zinc-200 pt-2">
                        <span className="font-medium text-zinc-900">Итого до Алматы:</span>
                        <span className="font-semibold text-[#C90C07]">{formatKzt(car.almatyTotal)}</span>
                      </div>
                      <a
                        href={WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block rounded-xl bg-[#25D366] px-3 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
                      >
                        Чтобы узнать цену под ключ — напишите нам
                      </a>
                    </>
                  ) : (
                    <div className="text-center text-zinc-400">Введите ссылку для расчета</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.aside>
        </section>

        <section className="mt-8">
          {!car && loading ? (
            <Card>
              <CardContent className="space-y-4 p-6 md:p-8">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-64 w-full" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {car && (
            <motion.div id="car-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-w-0">
              <Card className="overflow-hidden">
                <CardContent className="space-y-6 p-4 sm:p-6 md:p-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <h3 className="break-words text-xl font-semibold sm:text-2xl md:text-3xl">{car.title}</h3>
                    <Button variant="subtle" className="w-full shrink-0 sm:w-auto" onClick={downloadCarData}>
                      <Download className="mr-2 h-4 w-4" />
                      Скачать PNG
                    </Button>
                  </div>

                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-3">
                      <img
                        src={`/api/image?url=${encodeURIComponent(images[activeImage])}`}
                        alt="Car preview"
                        className="h-56 w-full rounded-2xl bg-zinc-100 object-cover sm:h-72 md:h-[320px]"
                      />
                      <div className="flex min-w-0 items-center gap-2">
                        <Button variant="subtle" className="shrink-0" onClick={() => setActiveImage((prev) => Math.max(0, prev - 1))}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div
                          ref={thumbsRef}
                          className="flex min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden touch-pan-x [scrollbar-width:thin]"
                          onPointerDown={(e) => {
                            const el = thumbsRef.current
                            if (!el) return
                            thumbsDrag.current = { active: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft }
                          }}
                          onPointerMove={(e) => {
                            if (!thumbsDrag.current.active || !thumbsRef.current) return
                            const dx = e.clientX - thumbsDrag.current.startX
                            if (Math.abs(dx) > 4) {
                              thumbsDrag.current.moved = true
                              thumbsRef.current.scrollLeft = thumbsDrag.current.startLeft - dx
                            }
                          }}
                          onPointerUp={() => { thumbsDrag.current.active = false }}
                          onPointerLeave={() => { thumbsDrag.current.active = false }}
                        >
                          {images.map((img, i) => (
                            <button
                              key={`${img}-${i}`}
                              type="button"
                              onClick={() => {
                                if (thumbsDrag.current.moved) return
                                setActiveImage(i)
                              }}
                              className={`h-14 w-20 shrink-0 overflow-hidden rounded-xl border ${i === activeImage ? "border-[#C90C07]" : "border-zinc-200"}`}
                            >
                              <img
                                src={`/api/image?url=${encodeURIComponent(img)}`}
                                alt={`car-${i}`}
                                className="h-full w-full object-cover pointer-events-none"
                              />
                            </button>
                          ))}
                        </div>
                        <Button variant="subtle" className="shrink-0" onClick={() => setActiveImage((prev) => Math.min(images.length - 1, prev + 1))}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                      {images.length > 1 && (
                        <p className="text-xs text-zinc-500">{activeImage + 1} / {images.length} фото</p>
                      )}
                    </div>

                    <div className="min-w-0 space-y-3">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <p className="mb-2 text-xs text-zinc-500">Авто (из Encar):</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="shrink-0 text-sm text-zinc-600">₩ (KRW)</span>
                            <span className="truncate text-right font-medium text-zinc-900">{car.price}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="shrink-0 text-sm text-zinc-600">$ (USD)</span>
                            <span className="text-right font-medium text-zinc-900">${new Intl.NumberFormat("en-US").format(car.carPriceUsd)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="shrink-0 text-sm text-zinc-600">₸ (KZT)</span>
                            <span className="text-right font-medium text-zinc-900">{formatKzt(car.carPriceKzt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="shrink-0 text-sm text-zinc-600">Логистика:</span>
                            <span className="text-right font-medium text-zinc-900">
                              {isDeliveryByAgreement(car.priceKrw)
                                ? DELIVERY_BY_AGREEMENT
                                : `$${new Intl.NumberFormat("en-US").format(car.logisticsUsd)}`}
                              {!isDeliveryByAgreement(car.priceKrw) && (
                                <span className="mt-0.5 block text-xs font-normal text-zinc-500">{formatKzt(car.logistics)}</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[#C90C07]/25 bg-gradient-to-r from-[#C90C07]/10 to-transparent p-4">
                        <p className="text-sm text-zinc-600">Итого до Алматы:</p>
                        <p className="mt-1 break-words text-2xl font-semibold text-[#C90C07] md:text-3xl">{formatKzt(car.almatyTotal)}</p>
                      </div>

                      <a
                        href={WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-4 text-center transition hover:bg-[#25D366]/15"
                      >
                        <p className="text-sm font-semibold text-[#128C7E]">
                          Чтобы узнать цену под ключ — обратитесь к нам
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">Нажмите, чтобы открыть WhatsApp</p>
                      </a>
                    </div>
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => window.open(WHATSAPP_URL, "_blank")}
                  >
                    Написать в WhatsApp
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {car && (
            <div
              id="car-pdf-content"
              className="pdf-content"
              aria-hidden="true"
              style={{
                width: "210mm",
                minHeight: "297mm",
                background: "#fff",
                color: "#1a1a1a",
                padding: "20px",
                fontFamily: "Arial, sans-serif",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: "20px", paddingBottom: "15px", borderBottom: "3px solid #C90C07" }}>
                <h1 style={{ fontSize: "22px", fontWeight: "700", margin: "0", color: "#1a1a1a" }}>ПРЕДЛОЖЕНИЕ ДЛЯ КЛИЕНТА</h1>
                <p style={{ fontSize: "12px", color: "#666", margin: "5px 0 0" }}>Lux Motors · Premium Auto Import from Korea</p>
              </div>

              <div style={{ display: "flex", gap: "15px", marginBottom: "25px" }}>
                <div style={{ width: "42%" }}>
                  <div style={{ height: "180px", overflow: "hidden", borderRadius: "8px", marginBottom: "12px", backgroundColor: "#f0f0f0" }}>
                    <img src={`/api/image?url=${encodeURIComponent(images[0])}`} alt="Car" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <h2 style={{ fontSize: "15px", fontWeight: "bold", margin: "0 0 10px", lineHeight: "1.4", color: "#000" }}>{car.title}</h2>
                  <div style={{ fontSize: "12px", color: "#333" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e0e0e0" }}>
                      <span style={{ color: "#666" }}>Год:</span>
                      <span style={{ fontWeight: "600" }}>{car.year}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e0e0e0" }}>
                      <span style={{ color: "#666" }}>Пробег:</span>
                      <span style={{ fontWeight: "600" }}>{car.mileage}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                      <span style={{ color: "#666" }}>Цена в Корее:</span>
                      <span style={{ fontWeight: "bold", color: "#C90C07" }}>{car.price}</span>
                    </div>
                  </div>
                </div>

                <div style={{ width: "55%", backgroundColor: "#f8f8f8", padding: "15px", borderRadius: "8px", border: "1px solid #e5e5e5" }}>
                  <div style={{ backgroundColor: "#C90C07", padding: "10px", borderRadius: "5px", textAlign: "center", marginBottom: "12px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "bold", margin: "0", color: "#fff" }}>ЧТО ВХОДИТ В СТОИМОСТЬ</h3>
                  </div>
                  <div style={{ fontSize: "11px", color: "#333", marginBottom: "10px" }}>
                    <p style={{ fontSize: "10px", color: "#666", margin: "0 0 4px" }}>Авто (₩ / $ / ₸):</p>
                    <div style={{ display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                      <span>₩ (KRW)</span>
                      <span style={{ fontWeight: "500" }}>{car.price}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                      <span>$ (USD)</span>
                      <span style={{ fontWeight: "500" }}>${new Intl.NumberFormat("en-US").format(car.carPriceUsd)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
                      <span>₸ (KZT)</span>
                      <span style={{ fontWeight: "500" }}>{new Intl.NumberFormat("ru-RU").format(car.carPriceKzt)} ₸</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0 2px" }}>
                      <span>Логистика:</span>
                      <span style={{ fontWeight: "500" }}>{isDeliveryByAgreement(car.priceKrw) ? DELIVERY_BY_AGREEMENT : `${new Intl.NumberFormat("ru-RU").format(car.logistics)} ₸`}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 0 0", paddingTop: "6px", borderTop: "2px solid #C90C07", fontWeight: "bold", fontSize: "12px" }}>
                      <span>Итого до Алматы:</span>
                      <span>{new Intl.NumberFormat("ru-RU").format(car.almatyTotal)} ₸</span>
                    </div>
                    <p style={{ fontSize: "10px", color: "#128C7E", margin: "10px 0 0", fontWeight: "600", textAlign: "center" }}>
                      Цену под ключ уточняйте в WhatsApp
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 12px", color: "#666" }}>
                  ФОТОГРАФИИ АВТОМОБИЛЯ ({images.length}):
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
                  {images.map((img, i) => (
                    <div key={i} style={{ height: "90px", overflow: "hidden", borderRadius: "6px" }}>
                      <img src={`/api/image?url=${encodeURIComponent(img)}`} alt={`car-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "linear-gradient(135deg, #C90C07 0%, #A00A06 100%)", color: "white", padding: "18px", borderRadius: "10px", textAlign: "center" }}>
                <p style={{ fontSize: "15px", fontWeight: "600", margin: "0 0 5px" }}>Готовы к покупке? Свяжитесь с нами!</p>
                <p style={{ fontSize: "18px", fontWeight: "700", margin: "5px 0" }}>WhatsApp: +82 10 21 84 67 77</p>
                <p style={{ fontSize: "12px", margin: "5px 0 0", opacity: "0.9" }}>https://wa.me/821021846777</p>
              </div>
            </div>
          )}
        </section>

        {!embed && (
        <>
        <section className="mt-16">
          <h2 className="mb-6 text-3xl font-semibold">Процесс импорта</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: Globe2, title: "Выбор авто", text: "Подбираете вариант на Encar." },
              { icon: BadgeDollarSign, title: "Финальный расчет", text: "Считаем до тенге за 1 клик." },
              { icon: Truck, title: "Доставка", text: "Логистика и оформление под ключ." },
              { icon: CheckCircle2, title: "Выдача в РК", text: "Получаете готовый авто пакет." },
            ].map((step, i) => (
              <Card key={step.title}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center justify-between">
                    <step.icon className="h-5 w-5 text-[#C90C07]" />
                    <span className="text-xs text-zinc-400">0{i + 1}</span>
                  </div>
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-zinc-600">{step.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-3xl font-semibold">Encar — покупка авто из Кореи</h2>
          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <h3 className="mb-3 font-bold text-[#C90C07]">1. Наша услуга — <span className="text-zinc-900">700$</span></h3>
                <p className="text-sm text-zinc-600">В эту стоимость входит автоподбор. С Вами мы подберем автомобиль под ваши требования и предпочтения. Далее, интересующий вас автомобиль наши сотрудники в Корее поедут проверять на тех.состояние, наличие повреждений, дефектов и т.д. Все это сопровождается обязательным видеоотчетом для вас.</p>
              </div>

              <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <h3 className="mb-3 font-bold text-[#C90C07]">2. Покупка и доставка</h3>
                <p className="mb-3 text-sm text-zinc-600">Когда уже утвердили покупку автомобиля, продавец авто выставляет счет на оплату (инвойс) на стоимость через наш офис в Республике Корея. Вы должны будете оплатить инвойс через банк в течении трех дней.</p>
                <p className="mb-3 text-sm text-zinc-600">Еще оплачиваются логистические расходы до Алматы — <span className="font-bold text-zinc-900">2000$</span>. После мы бронируем автомобиль, вносим задаток. После поступления оплаты за машину (обычно 3 рабочих дней) привозят к нам на парковку (в Корее), готовят экспортную документацию и отправляют в порт.</p>
                <p className="text-sm text-zinc-600">Далее ТС грузят на корабль и отправляют в Китай, оттуда автовозы принимают наши автомобили и доставляют до Казахстана.</p>
              </div>

              <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <h3 className="mb-3 font-bold text-[#C90C07]">3. Прибытие в Казахстан</h3>
                <p className="text-sm text-zinc-600">По прибытию автомобиля к нам в Алматы, оплачиваются таможенные пошлины и расходы, в виде сертификата безопасности, растаможки, НДС и утильсбора.</p>
              </div>

              <div className="rounded-lg border border-[#C90C07]/25 bg-[#C90C07]/5 p-4">
                <h3 className="mb-3 font-bold">Сроки доставки</h3>
                <ul className="space-y-2 text-sm text-zinc-600">
                  <li>Автомобиль будет доставлен в Казахстан в течении <span className="font-bold text-zinc-900">30–35 дней</span></li>
                  <li>Таможенные процессы занимают до <span className="font-bold text-zinc-900">5 рабочих дней</span> в среднем</li>
                </ul>
              </div>

              <div className="rounded-lg border border-[#C90C07]/20 bg-[#C90C07]/5 p-4 text-center">
                <p className="font-medium text-zinc-800">Ваше ТС в обязательном порядке будет доставлено в целости и сохранности.</p>
                <p className="mt-2 text-sm text-zinc-500">С уважением, команда Lux Motors.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-3xl font-semibold">Аукцион HeyDealer</h2>
          <Card>
            <CardContent className="space-y-6 p-6">
              <p className="text-zinc-600">
                Мы подбираем для вас лучшие варианты под ваш бюджет и запрос — отправляем лично или публикуем в Telegram. Вы выбираете автомобиль, который вам нравится.
              </p>
              <p className="text-zinc-600">
                Далее вы оплачиваете нашу услугу — <span className="font-bold text-[#C90C07]">1000$</span>, и мы заключаем с вами договор. После этого начинаем работу по аукциону.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <h3 className="mb-3 font-bold text-[#C90C07]">SELF — безопасный формат</h3>
                  <p className="mb-3 text-sm text-zinc-600">Мы ставим ставку на автомобиль. Если ставка выигрывает, наши специалисты в Корее выезжают на осмотр и проводят полную проверку: компьютерная диагностика, кузов (толщиномер), салон и техническая часть.</p>
                  <p className="text-sm text-zinc-600">После этого вы принимаете решение:</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2"><span className="text-emerald-600">✔️</span> <span className="text-zinc-600">подходит — выкупаете</span></div>
                    <div className="flex items-center gap-2"><span className="text-red-600">❌</span> <span className="text-zinc-600">не подходит — отказываетесь</span></div>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                  <h3 className="mb-3 font-bold text-[#C90C07]">ZERO — быстрый формат</h3>
                  <p className="mb-3 text-sm text-zinc-600">По автомобилю уже есть вся подробная информация: фото, состояние, технические данные.</p>
                  <p className="text-sm font-medium text-red-600">❗️ Если ставка выигрывает — автомобиль сразу выкупается без отказа.</p>
                </div>
              </div>

              <div className="rounded-lg border border-[#C90C07]/25 bg-[#C90C07]/5 p-4">
                <h3 className="mb-3 font-bold">Как проходит оплата (по этапно)</h3>
                <ul className="space-y-2 text-sm text-zinc-600">
                  <li>Если ставка сыграла: мы проверяем автомобиль → отправляем вам полный отчёт → вы подтверждаете покупку → оплачивается фактическая стоимость авто в Корее и оплачивается логистика — <span className="font-bold text-[#C90C07]">2000$</span></li>
                  <li>Мы подготавливаем все документы: снятие с учёта и экспортные документации!</li>
                  <li>Погрузка контейнера — 1 раз в неделю.</li>
                  <li>С момента загрузки доставка в Казахстан занимает <span className="font-bold text-zinc-900">30–35 дней</span>.</li>
                </ul>
              </div>

              <div className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <h3 className="mb-2 font-bold">По прибытию в Казахстан оплачиваются:</h3>
                <p className="text-sm text-zinc-600">таможня, утильсбор, первичная регистрация и СВХ.</p>
              </div>

              <div className="rounded-lg border border-[#C90C07]/20 bg-[#C90C07]/5 p-4 text-center">
                <p className="text-zinc-800">Можем сразу сделать просчёт под ваш бюджет и подобрать варианты под вас — просто напишите.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-16">
          <h2 className="mb-6 text-3xl font-semibold">FAQ</h2>
          <div className="space-y-3">
            {[
              ["Расчет финальный?", "Это предварительная коммерческая оценка. Финальные цифры подтверждаются по VIN и документам."],
              ["Как быстро обновляются ставки?", "Курсы и внутренние коэффициенты регулярно обновляются в сервисе."],
              ["Можно ли считать несколько авто?", "Да, без ограничений по количеству расчетов."],
            ].map(([q, a]) => (
              <Card key={q}>
                <CardContent className="p-0">
                  <details className="group p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                      <span className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-[#C90C07]" />{q}</span>
                      <span className="text-zinc-400 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="pt-3 text-sm text-zinc-600">{a}</p>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-zinc-200 py-8 text-sm text-zinc-500">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Lux Motors · Казахстан</p>
            <p>© 2026 Lux Motors</p>
          </div>
        </footer>
        </>
        )}
      </div>
    </main>
  )
}
