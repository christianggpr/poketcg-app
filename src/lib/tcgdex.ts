// Descarga de precios desde TCGdex (solo servidor) con caché compartida en la tabla `precios`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { API_TCGDEX, FX_FALLBACK, MAX_EDAD_MS, parsearPrecio, type RegistroPrecio } from './precios-core';

const API = process.env.TCGDEX_API || API_TCGDEX;
const FX_API = process.env.FX_API || 'https://open.er-api.com/v6/latest/EUR';

type CartaMin = { id: string; numero: string; sin_datos: boolean; coleccion: { id: string; region: string; tcgdex_id: string | null } | null };

function urlDe(c: CartaMin): string | null {
  if (!c.coleccion || c.sin_datos) return null;
  if (c.coleccion.region === 'ja') return `${API}/ja/cards/${c.coleccion.tcgdex_id || c.coleccion.id.replace(/^jp-/, '')}-${c.numero}`;
  return `${API}/en/cards/${c.id}`;
}

let fxCache: { usd: number; t: number } = { usd: FX_FALLBACK, t: 0 };

/** Dólares por euro (cambio del día), con caché en memoria y en `ajustes_globales`. */
export async function tipoCambio(admin: SupabaseClient): Promise<number> {
  if (Date.now() - fxCache.t < MAX_EDAD_MS) return fxCache.usd;
  try {
    const { data } = await admin.from('ajustes_globales').select('valor').eq('clave', 'fx_eur_usd').maybeSingle();
    const v = data?.valor as { usd?: number; t?: number } | undefined;
    if (v && v.usd && v.t && Date.now() - v.t < MAX_EDAD_MS) { fxCache = { usd: v.usd, t: v.t }; return v.usd; }
  } catch { /* sin tabla o sin datos */ }
  try {
    const r = await fetch(FX_API, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { rates?: { USD?: number } };
    const usd = j.rates?.USD;
    if (usd && usd > 0.5 && usd < 3) {
      fxCache = { usd, t: Date.now() };
      admin.from('ajustes_globales').upsert({ clave: 'fx_eur_usd', valor: fxCache, actualizado_en: new Date().toISOString() }).then(() => {}, () => {});
      return usd;
    }
  } catch { /* se usa el valor anterior o el de respaldo */ }
  return fxCache.usd || FX_FALLBACK;
}

async function descargar(url: string, id: string): Promise<RegistroPrecio> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'PokeTCG/2.0 (poketcg.pe)' } });
    if (r.status === 404) return { id, t: Date.now(), ok: false, tp: null, cm: null, missing: true };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return parsearPrecio(id, await r.json());
  } catch (e) {
    // error de red: se guarda con fecha atrasada para reintentar pronto
    return { id, t: Date.now() - MAX_EDAD_MS + 3600 * 1000, ok: false, tp: null, cm: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Devuelve los precios de las cartas pedidas, renovando los que tengan más de 20 h. */
export async function preciosDe(admin: SupabaseClient, ids: string[], forzar = false): Promise<{ registros: RegistroPrecio[]; fx: number }> {
  const unicos = [...new Set(ids)].filter(id => typeof id === 'string' && id.length < 60).slice(0, 300);
  const registros = new Map<string, RegistroPrecio>();
  const cartas = new Map<string, CartaMin>();
  if (unicos.length) {
    const [precios, filasCartas] = await Promise.all([
      admin.from('precios').select('carta_id, datos, actualizado_en').in('carta_id', unicos),
      admin.from('cartas').select('id, numero, sin_datos, coleccion:colecciones_tcg(id, region, tcgdex_id)').in('id', unicos)
    ]);
    for (const row of precios.data || []) {
      const rec = row.datos as RegistroPrecio;
      rec.id = row.carta_id;
      rec.t = Date.parse(row.actualizado_en) || rec.t || 0;
      registros.set(row.carta_id, rec);
    }
    for (const row of (filasCartas.data || []) as unknown as CartaMin[]) cartas.set(row.id, row);
  }
  const pendientes = unicos.filter(id => { const r = registros.get(id); return cartas.has(id) && (forzar || !r || Date.now() - r.t > MAX_EDAD_MS); });
  const nuevos: RegistroPrecio[] = [];
  let i = 0;
  const trabajador = async () => {
    while (i < pendientes.length) {
      const id = pendientes[i++];
      const url = urlDe(cartas.get(id)!);
      if (!url) { registros.set(id, { id, t: Date.now(), ok: false, tp: null, cm: null, missing: true }); continue; }
      const rec = await descargar(url, id);
      registros.set(id, rec);
      if (!rec.error) nuevos.push(rec);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, pendientes.length) }, trabajador));
  if (nuevos.length) {
    const filas = nuevos.map(r => ({ carta_id: r.id, datos: { ok: r.ok, tp: r.tp, cm: r.cm, missing: r.missing || false }, actualizado_en: new Date(r.t).toISOString() }));
    await admin.from('precios').upsert(filas, { onConflict: 'carta_id' });
  }
  const fx = await tipoCambio(admin);
  return { registros: unicos.map(id => registros.get(id)!).filter(Boolean), fx };
}
