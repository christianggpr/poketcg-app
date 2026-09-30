// Precios de venta por carta y acabado (fuente: TCGdex → TCGplayer en USD y Cardmarket en EUR).
// Lógica pura, compartida entre el servidor (descarga) y el navegador (valor mostrado).
import type { Carta, Coleccion } from './catalogo';

export const API_TCGDEX = 'https://api.tcgdex.net/v2';
export const MAX_EDAD_MS = 20 * 3600 * 1000;
export const FX_FALLBACK = 1.14; // USD por EUR si no se puede consultar el cambio

export type RegistroPrecio = {
  id: string;
  t: number;                        // fecha de descarga (ms)
  ok: boolean;
  tp: Record<string, number> | null; // TCGplayer USD por acabado
  cm: { trend: number | null; holo: number | null } | null; // Cardmarket EUR
  missing?: boolean;
  error?: string;
};

export type Valor = { usd: number; finish: string; label: string; approx: boolean; src: string; eur?: number; finishes: { k: string; label: string; usd: number }[] };

const FINISH_LABEL: Record<string, string> = { normal: 'Normal', holofoil: 'Holo', 'reverse-holofoil': 'Reverse holo', '1st-edition': '1ª edición', '1st-edition-holofoil': '1ª edición holo', unlimited: 'Ilimitada', 'unlimited-holofoil': 'Ilimitada holo' };
const PREF: Record<string, string[]> = {
  Normal: ['normal', 'unlimited', '1st-edition', 'holofoil', 'unlimited-holofoil', 'reverse-holofoil'],
  Holo: ['holofoil', 'unlimited-holofoil', '1st-edition-holofoil', 'reverse-holofoil', 'normal'],
  Reverse: ['reverse-holofoil', 'holofoil', 'unlimited-holofoil', 'normal'],
  '': ['normal', 'unlimited', 'holofoil', 'unlimited-holofoil', '1st-edition-holofoil', '1st-edition', 'reverse-holofoil']
};
const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

export function urlPrecio(card: Carta, set: Coleccion | undefined): string | null {
  if (!set || card.sd || card.sinTcgdex) return null;
  if (set.rg === 'ja') return `${API_TCGDEX}/ja/cards/${set.tid || set.id.replace(/^jp-/, '')}-${card.l}`;
  return `${API_TCGDEX}/en/cards/${card.id}`;
}

export function parsearPrecio(id: string, j: unknown): RegistroPrecio {
  const rec: RegistroPrecio = { id, t: Date.now(), ok: false, tp: null, cm: null };
  const p = (j as { pricing?: { tcgplayer?: Record<string, unknown>; cardmarket?: Record<string, unknown> } } | null)?.pricing;
  if (p && p.tcgplayer) {
    const tp: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.tcgplayer)) {
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const price = num(o.marketPrice) || num(o.midPrice) || num(o.directLowPrice) || num(o.lowPrice);
      if (price) tp[k] = Math.round(price * 100) / 100;
    }
    if (Object.keys(tp).length) { rec.tp = tp; rec.ok = true; }
  }
  if (p && p.cardmarket) {
    const c = p.cardmarket;
    const cm = { trend: num(c.trend) || num(c.avg7) || num(c.avg) || num(c.avg30) || num(c.low), holo: num(c['trend-holo']) || num(c['avg7-holo']) || num(c['avg-holo']) || num(c['avg30-holo']) || num(c['low-holo']) };
    if (cm.trend || cm.holo) { rec.cm = cm; rec.ok = true; }
  }
  return rec;
}

/** Valor en dólares de una carta según el acabado registrado ('', 'Normal', 'Holo', 'Reverse', 'Otra'). */
export function valorDe(rec: RegistroPrecio | null | undefined, acabado: string, fxUsd: number = FX_FALLBACK): Valor | null {
  if (!rec || !rec.ok) return null;
  const v = acabado === 'Normal' || acabado === 'Holo' || acabado === 'Reverse' ? acabado : '';
  if (rec.tp) {
    const order = PREF[v];
    const keys = Object.keys(rec.tp);
    const finish = order.find(k => rec.tp![k] != null) || keys[0];
    const wanted = v === 'Normal' ? 'normal' : v === 'Holo' ? 'holofoil' : v === 'Reverse' ? 'reverse-holofoil' : null;
    const approx = !!(wanted && finish !== wanted) || (!v && keys.length > 1);
    return { usd: rec.tp[finish], finish, label: FINISH_LABEL[finish] || finish, approx, src: 'TCGplayer', finishes: keys.map(k => ({ k, label: FINISH_LABEL[k] || k, usd: rec.tp![k] })) };
  }
  if (rec.cm) {
    const holo = v === 'Reverse' || v === 'Holo';
    const eur = holo ? rec.cm.holo || rec.cm.trend : rec.cm.trend || rec.cm.holo;
    if (!eur) return null;
    const fx = fxUsd || FX_FALLBACK;
    const usd = Math.round(eur * fx * 100) / 100;
    const used = holo ? (rec.cm.holo ? 'holo' : 'normal') : rec.cm.trend ? 'normal' : 'holo';
    const finishes = [rec.cm.trend ? { k: 'normal', label: 'Normal', usd: Math.round(rec.cm.trend * fx * 100) / 100 } : null, rec.cm.holo ? { k: 'holo', label: 'Holo / reverse', usd: Math.round(rec.cm.holo * fx * 100) / 100 } : null].filter((x): x is { k: string; label: string; usd: number } => !!x);
    return { usd, finish: used, label: used === 'holo' ? 'Holo / reverse' : 'Normal', approx: holo ? !rec.cm.holo : !rec.cm.trend, src: 'Cardmarket', eur, finishes };
  }
  return null;
}

export function fmtUsd(usd: number | null | undefined): string {
  return usd == null ? '—' : 'US$ ' + (usd >= 100 ? Math.round(usd).toLocaleString('es-PE') : usd.toFixed(2));
}
