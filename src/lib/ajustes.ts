// Ajustes globales del mercado (tipo de cambio, pisos, comisión) guardados en `ajustes_globales`. Solo servidor.
import type { SupabaseClient } from '@supabase/supabase-js';
import { AJUSTES_POR_DEFECTO, FX_RESPALDO, MAX_EDAD_MS, PAGOS_POR_DEFECTO, type Ajustes, type AjustesPagos, type TipoCambio } from './precios-core';

const FX_API = process.env.FX_API_USD || process.env.FX_API?.replace(/EUR$/, 'USD') || 'https://open.er-api.com/v6/latest/USD';

let cache: { ajustes: Ajustes; t: number } | null = null;

async function leerClave<T>(admin: SupabaseClient, clave: string): Promise<T | null> {
  const { data } = await admin.from('ajustes_globales').select('valor').eq('clave', clave).maybeSingle();
  return (data?.valor as T) ?? null;
}
async function escribirClave(admin: SupabaseClient, clave: string, valor: unknown): Promise<void> {
  await admin.from('ajustes_globales').upsert({ clave, valor, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
  cache = null;
}

/** Ajustes vigentes (con caché de 5 min en memoria). */
export async function cargarAjustes(admin: SupabaseClient, fresco = false): Promise<Ajustes> {
  if (cache && !fresco && Date.now() - cache.t < 5 * 60 * 1000) return cache.ajustes;
  const [fx, respaldo, pisos, comision, pagos] = await Promise.all([
    leerClave<TipoCambio>(admin, 'fx'),
    leerClave<TipoCambio>(admin, 'fx_respaldo'),
    leerClave<{ normal: number; especial: number }>(admin, 'pisos'),
    leerClave<{ valor: number }>(admin, 'comision'),
    leerClave<Partial<AjustesPagos>>(admin, 'pagos')
  ]);
  const fxValido = fx && fx.usd_pen > 0 && fx.eur_pen > 0 ? fx : null;
  const ajustes: Ajustes = {
    fx: fxValido || (respaldo && respaldo.usd_pen > 0 ? { ...respaldo, fuente: 'respaldo' } : FX_RESPALDO),
    pisos: pisos && pisos.normal >= 0 && pisos.especial >= 0 ? pisos : AJUSTES_POR_DEFECTO.pisos,
    comision: comision && comision.valor >= 0 && comision.valor < 1 ? comision.valor : AJUSTES_POR_DEFECTO.comision,
    pagos: { ...PAGOS_POR_DEFECTO, ...(pagos || {}) }
  };
  cache = { ajustes, t: Date.now() };
  return ajustes;
}

/** Descarga el tipo de cambio del día (USD→PEN y EUR→PEN). Si falla, conserva el anterior o el de respaldo. */
export async function renovarTipoCambio(admin: SupabaseClient, forzar = false): Promise<{ fx: TipoCambio; renovado: boolean; error?: string }> {
  const actual = await leerClave<TipoCambio>(admin, 'fx');
  if (!forzar && actual && actual.t && Date.now() - actual.t < MAX_EDAD_MS) return { fx: actual, renovado: false };
  try {
    const r = await fetch(FX_API, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = (await r.json()) as { rates?: { PEN?: number; EUR?: number } };
    const pen = j.rates?.PEN, eur = j.rates?.EUR;
    if (!pen || !eur || pen < 1 || pen > 10 || eur < 0.5 || eur > 2) throw new Error('respuesta rara: ' + JSON.stringify(j.rates || {}).slice(0, 80));
    const fx: TipoCambio = { usd_pen: Math.round(pen * 10000) / 10000, eur_pen: Math.round((pen / eur) * 10000) / 10000, t: Date.now(), fuente: 'open.er-api.com', ultimo_intento: Date.now(), ultimo_error: null };
    await escribirClave(admin, 'fx', fx);
    cache = null;   // que la siguiente lectura vea el valor nuevo
    return { fx, renovado: true };
  } catch (e) {
    // se conserva el último valor y queda registrado el intento fallido (se muestra en /admin)
    const mensaje = e instanceof Error ? e.message : String(e);
    const respaldo = await leerClave<TipoCambio>(admin, 'fx_respaldo');
    const fx: TipoCambio = actual || (respaldo ? { ...respaldo, fuente: 'respaldo' } : FX_RESPALDO);
    try { await escribirClave(admin, 'fx', { ...fx, ultimo_intento: Date.now(), ultimo_error: mensaje }); cache = null; } catch { /* sin base */ }
    return { fx, renovado: false, error: mensaje };
  }
}

export async function guardarAjustes(admin: SupabaseClient, d: { fx_respaldo?: { usd_pen: number; eur_pen: number }; pisos?: { normal: number; especial: number }; comision?: number }): Promise<void> {
  if (d.fx_respaldo) await escribirClave(admin, 'fx_respaldo', { usd_pen: d.fx_respaldo.usd_pen, eur_pen: d.fx_respaldo.eur_pen, fuente: 'respaldo' });
  if (d.pisos) await escribirClave(admin, 'pisos', d.pisos);
  if (d.comision != null) await escribirClave(admin, 'comision', { valor: d.comision });
}
