"use client"

import { useEffect, useState } from "react"
import { ServerCrash } from "lucide-react"

const ENABLED = true

export function ServerMemoryAlert() {
  const [open, setOpen] = useState(ENABLED)

  useEffect(() => {
    if (ENABLED) setOpen(true)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-memory-alert-title"
    >
      <div className="flex max-w-lg flex-col items-center rounded-3xl border-2 border-[#C90C07] bg-white px-8 py-10 text-center shadow-2xl">
        <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-[#FEE2E2]">
          <ServerCrash size={72} className="text-[#C90C07]" strokeWidth={1.75} />
        </div>
        <h2
          id="server-memory-alert-title"
          className="mb-3 text-2xl font-extrabold leading-tight text-[#111] sm:text-3xl"
        >
          Оперативная память сервера заполнена
        </h2>
        <p className="mb-8 text-base font-semibold leading-relaxed text-[#666] sm:text-lg">
          Просим увеличить память
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl bg-[#C90C07] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#A00A06]"
        >
          Закрыть
        </button>
      </div>
    </div>
  )
}
