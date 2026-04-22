import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 👇 Only use 'export' and relative paths for production/Electron
  output: isProd ? 'export' : undefined,
  assetPrefix: isProd ? './' : '',
  trailingSlash: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
};

export default nextConfig;
