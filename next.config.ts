import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Las imágenes de cartas se sirven directamente desde TCGdex / pokemontcg.io (sin optimizar en Vercel)
    unoptimized: true
  },
  async headers() {
    return [
      {
        source: '/data/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }]
      }
    ];
  }
};

export default nextConfig;
