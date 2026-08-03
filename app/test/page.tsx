"use client"

import { useEffect, useState } from "react"

export default function HomePage() {
  const [cars, setCars] = useState<any[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/cars")
      .then((res) => res.json())
      .then((data) => setCars(data))
  }, [])

  const filteredCars = cars.filter(
    (car: any) => {
      const marka = String(
        car["Марка"] || ""
      ).toLowerCase()

      const model = String(
        car["Модель"] || ""
      ).toLowerCase()

      return (
        marka.includes(
          search.toLowerCase()
        ) ||
        model.includes(
          search.toLowerCase()
        )
      )
    }
  )

  return (
    <main className="min-h-screen bg-black text-white p-10">
      <h1 className="text-5xl font-bold mb-3">
        AI Auto Import
      </h1>

      <p className="text-gray-400 mb-8">
        Калькулятор автоимпорта из Кореи
      </p>

      <input
        type="text"
        placeholder="Введите марку или модель"
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        className="
          w-full
          p-4
          rounded-xl
          bg-[#111]
          border
          border-gray-700
          mb-8
          text-lg
        "
      />

      <p className="mb-6 text-gray-400">
        Найдено: {filteredCars.length}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {filteredCars
          .slice(0, 30)
          .map((car: any, index) => (
            <div
              key={index}
              className="
                bg-[#111]
                border
                border-gray-800
                rounded-2xl
                p-6
              "
            >
              <h2 className="text-2xl font-bold mb-4">
                {car["Марка"]}{" "}
                {car["Модель"]}
              </h2>

              <div className="space-y-2 text-gray-300">
                <p>
                  Объем: {car["Объем"]}
                </p>

                <p>
                  Год: {car["год выпуска"]}
                </p>

                <p className="text-yellow-400 text-xl font-bold pt-3">
                  {
                    car[
                      "Цена в долларах США"
                    ]
                  }{" "}
                  $
                </p>
              </div>

              <button
                className="
                  mt-6
                  w-full
                  bg-yellow-400
                  text-black
                  py-3
                  rounded-xl
                  font-semibold
                "
              >
                Рассчитать стоимость
              </button>
            </div>
          ))}
      </div>
    </main>
  )
}