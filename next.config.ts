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
      },
      {
        // app Android: que el navegador la descargue como archivo .apk
        source: '/descargas/poketcg.apk',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
          { key: 'Content-Disposition', value: 'attachment; filename="poketcg.apk"' },
          { key: 'Cache-Control', value: 'public, max-age=600, must-revalidate' }
        ]
      },
      {
        // enlace web ↔ app Android (Digital Asset Links)
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Cache-Control', value: 'public, max-age=3600' }]
      }
    ];
  }
};

export default nextConfig;
