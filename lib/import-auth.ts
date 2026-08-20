import { NextRequest } from "next/server"

const ALLOWED_ORIGINS = [
  "https://luxmotors-calc.vercel.app",
  "https://www.luxmotors.kz",
  "https://luxmotors.kz",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]

export function calcImportSecret(): string {
  return process.env.CRON_SECRET || process.env.CALC_IMPORT_SECRET || ""
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin") || ""
  const referer = req.headers.get("referer") || ""
  return ALLOWED_ORIGINS.some((o) => origin.startsWith(o) || referer.startsWith(o))
}

/** Cron / server-to-server / same-site calculator UI. */
export function authorizedImport(req: NextRequest): boolean {
  const secret = calcImportSecret()
  if (secret) {
    const header = req.headers.get("authorization") || ""
    const bearer = header.replace(/^Bearer\s+/i, "").trim()
    const calcHeader = req.headers.get("x-calc-secret") || ""
    const query = req.nextUrl.searchParams.get("secret") || ""
    if (bearer === secret || calcHeader === secret || query === secret) return true
  }

  if (process.env.NODE_ENV !== "production") return true
  return originAllowed(req)
}

export function importAuthHeaders(): Record<string, string> {
  const secret = calcImportSecret()
  if (!secret) return {}
  return {
    Authorization: `Bearer ${secret}`,
    "X-Calc-Secret": secret,
  }
}
