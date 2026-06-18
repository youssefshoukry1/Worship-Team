import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 1. Always use 'export' for static site generation
  output: 'export',

  // تم إيقاف الـ assetPrefix عشان يتوافق مع Capacitor والموبايل
  assetPrefix: '',

  trailingSlash: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
};

export default nextConfig;