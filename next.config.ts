import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://luxmotors.kz https://www.luxmotors.kz http://127.0.0.1:5173 http://127.0.0.1:5174 http://localhost:5173 http://localhost:5174",
          },
        ],
      },
    ]
  },
}

export default nextConfig