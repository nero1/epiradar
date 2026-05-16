import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  // Security headers
  async headers() {
    // unsafe-eval is only needed in development (webpack HMR).
    // It is stripped from production CSP to prevent eval-based XSS (PRD §5.2).
    const scriptSrcParts = [
      "'self'",
      ...(!isProd ? ["'unsafe-eval'"] : []),
      "'unsafe-inline'", // Required for Next.js hydration inline scripts
      "https://challenges.cloudflare.com",
    ];

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrcParts.join(" ")}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://api.deepseek.com https://generativelanguage.googleapis.com",
              "frame-src https://challenges.cloudflare.com",
            ].join("; "),
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
