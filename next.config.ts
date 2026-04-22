import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 👇 مهم جداً لتحويل المشروع لـ static site
  output: 'export',

  // 👇 بيحل مشاكل الـ CSS/JS paths في Electron
  trailingSlash: true,
  assetPrefix: './',

  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
};

export default nextConfig;