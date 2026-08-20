/**
 * Добивает дневную квоту 100 машин: несколько вызовов /api/daily-import подряд.
 *   CALC_URL=https://luxmotors-calc.vercel.app CRON_SECRET=... node scripts/run-daily-import.mjs
 */
const BASE = (process.env.CALC_URL || "https://luxmotors-calc.vercel.app").replace(/\/$/, "")
const SECRET = process.env.CRON_SECRET || process.env.CALC_IMPORT_SECRET || ""

async function tick() {
  const url = `${BASE}/api/daily-import?batch=8`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "X-Calc-Secret": SECRET,
      "Content-Type": "application/json",
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data
}

async function main() {
  let remaining = 100
  let total = 0
  for (let i = 0; i < 20 && remaining > 0; i++) {
    const data = await tick()
    const imported = Number(data.imported) || 0
    remaining = Number(data.remainingToday)
    total += imported
    console.log(
      `batch ${i + 1}: +${imported}, today=${data.importedToday}, remaining=${remaining}`
    )
    if (imported === 0) break
  }
  console.log(`done: imported ${total}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
