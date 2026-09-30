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
      },
      {
        // el service worker debe poder actualizarse en cada visita
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, max-age=0' }, { key: 'Service-Worker-Allowed', value: '/' }]
      }
    ];
  }
};

export default nextConfig;
