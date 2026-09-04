import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  /* ── Turbopack root to suppress multi-lockfile warning ────────── */
  turbopack: {
    root: path.resolve(__dirname),
  },

  /* ── Security headers ──────────────────────────────────────────── */
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
  ],

  /* ── Image optimization ────────────────────────────────────────── */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
