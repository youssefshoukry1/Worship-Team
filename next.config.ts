import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  // Always use 'export' so the same build can run in Capacitor and on the web.
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
