import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return new NextResponse("Missing URL", { status: 400 })
  }

  const referer =
    url.includes("kbchachacha.com") || url.includes("img.kbchachacha.com")
      ? "https://www.kbchachacha.com/"
      : url.includes("heydealer.com") || url.includes("image.heydealer.com")
        ? "https://www.heydealer.com/"
        : "https://www.encar.com/"

  try {
    const response = await fetch(url, {
      headers: {
        Referer: referer,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      return new NextResponse("Failed to fetch image", { status: response.status })
    }

    const blob = await response.blob()
    const headers = new Headers()
    headers.set("Content-Type", response.headers.get("Content-Type") || "image/jpeg")
    headers.set("Cache-Control", "public, max-age=86400")

    return new NextResponse(blob, { headers })
  } catch (error) {
    console.error("Image proxy error:", error)
    return new NextResponse("Image fetch failed", { status: 500 })
  }
}
