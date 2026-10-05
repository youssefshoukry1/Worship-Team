import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  // Capacitor needs the generated `out` directory. On Vercel, use the native
  // Next.js runtime so App Router navigation receives valid RSC responses.
  ...(isVercelBuild ? {} : { output: 'export' as const }),

  // تم إيقاف الـ assetPrefix عشان يتوافق مع Capacitor والموبايل
  assetPrefix: '',

  trailingSlash: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
};

export default nextConfig;
