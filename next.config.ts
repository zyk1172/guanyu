import type { NextConfig } from "next";

const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  outputFileTracingIncludes: {
    '/api/audits/[id]/export': [
      // PDF export embeds this font from the server file system at export time.
      './public/fonts/NotoSansSC-Regular.ttf',
      './public/fonts/NotoSansKR-Variable.ttf',
    ],
  },
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
