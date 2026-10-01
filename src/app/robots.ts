import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/config';

/** robots.txt: las páginas públicas se indexan; la app privada, el admin y la API no. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/app/', '/admin', '/api/', '/cuenta/', '/verificar', '/auth/'] }], sitemap: `${appUrl()}/sitemap.xml` };
}
