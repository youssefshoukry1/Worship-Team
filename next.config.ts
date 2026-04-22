import type { NextConfig } from "next";

// Check if we are on Vercel (Vercel sets this variable automatically)
const isVercel = process.env.VERCEL === '1';
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // 1. Always use 'export' for static site generation
  output: 'export',

  // 2. Only use './' if it's a production build AND NOT on Vercel (e.g., for Electron)
  // 3. If it's Vercel or Development, use ''
  assetPrefix: (isProd && !isVercel) ? './' : '',

  trailingSlash: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
};

export default nextConfig;
