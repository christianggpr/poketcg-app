import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/config';
import { supabasePublico } from '@/lib/publico';

export const dynamic = 'force-dynamic';

/** sitemap.xml: páginas públicas, perfiles de vendedores y fichas de las cartas con ofertas o ventas. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const ahora = new Date();
  const fijas: MetadataRoute.Sitemap = ['', '/ayuda', '/tiendas', '/instalar', '/terminos', '/privacidad', '/registro'].map(p => ({ url: base + (p || '/'), lastModified: ahora, changeFrequency: p === '' ? 'daily' : 'weekly', priority: p === '' ? 1 : 0.6 }));
  try {
    const sb = supabasePublico();
    const [{ data: ofertas }, { data: ventas }, { data: vendedores }] = await Promise.all([
      sb.from('mercado').select('carta_id, actualizada').limit(5000),
      sb.from('ventas_publicas').select('carta_id, entregada_en').limit(5000),
      sb.from('mercado').select('vendedor').limit(5000)   // solo quienes tienen cartas en venta
    ]);
    const cartas = new Map<string, Date>();
    for (const o of (ofertas || []) as { carta_id: string; actualizada: string }[]) cartas.set(o.carta_id, new Date(o.actualizada));
    for (const v of (ventas || []) as { carta_id: string; entregada_en: string }[]) { const d = new Date(v.entregada_en); const e = cartas.get(v.carta_id); if (!e || d > e) cartas.set(v.carta_id, d); }
    const fichas: MetadataRoute.Sitemap = [...cartas.entries()].map(([id, d]) => ({ url: `${base}/carta/${encodeURIComponent(id)}`, lastModified: d, changeFrequency: 'daily', priority: 0.8 }));
    const perfiles: MetadataRoute.Sitemap = [...new Set(((vendedores || []) as { vendedor: string }[]).map(v => v.vendedor))].map(u => ({ url: `${base}/u/${encodeURIComponent(u)}`, lastModified: ahora, changeFrequency: 'weekly', priority: 0.5 }));
    return [...fijas, ...fichas, ...perfiles];
  } catch { return fijas; }
}
