// Mazos meta (Fase 2 · D): qué tengo de cada variante. Funciones puras (navegador y pruebas).
// Reglas: primero la misma impresión; luego equivalentes (mismo nombre para Entrenador/Energía,
// mismo nombre + PS para Pokémon), solo cartas internacionales (las japonesas no cuentan) en ES/EN.
import { fold, numNorm, type Carta, type Catalogo } from './catalogo';
import type { Entrada } from './coleccion';
import type { CartaMazo } from './mazos-core';

export type IndiceMazos = { porImpresion: Map<string, Carta>; porNombre: Map<string, Carta[]> };

/** Nombre comparable: sin acentos, minúsculas, apóstrofos unificados y sin el prefijo "Basic " de las energías. */
export function nombreClave(n: string): string {
  return fold(n).replace(/[’‘`´]/g, "'").replace(/^basic\s+/, '').replace(/\s+/g, ' ').trim();
}

/** Índices del catálogo (solo colecciones internacionales): por código+número y por nombre. */
export function construirIndice(cat: Catalogo): IndiceMazos {
  const porImpresion = new Map<string, Carta>();
  const porNombre = new Map<string, Carta[]>();
  for (const c of cat.cards) {
    if (c.sd || c.rg === 'ja') continue;
    const s = cat.setOf(c);
    if (!s || s.rg === 'ja') continue;
    if (s.ab) { const k = `${s.ab.toUpperCase()}|${numNorm(c.l)}`; if (!porImpresion.has(k)) porImpresion.set(k, c); }
    const nk = nombreClave(c.n);
    const l = porNombre.get(nk); if (l) l.push(c); else porNombre.set(nk, [c]);
  }
  return { porImpresion, porNombre };
}

/** Misma impresión y equivalentes de una carta de lista. */
export function equivalentes(indice: IndiceMazos, c: CartaMazo): { misma: Carta | null; otras: Carta[] } {
  const misma = indice.porImpresion.get(`${c.set.toUpperCase()}|${numNorm(c.num)}`) || null;
  const candidatas = indice.porNombre.get(nombreClave(c.nombre)) || [];
  const otras = candidatas.filter(x => x !== misma && (c.cat !== 'P' || !misma || x.hp === misma.hp));
  // sin la misma impresión en el catálogo, un Pokémon equivalente debe compartir PS entre sí: se toman los de PS más frecuente
  return { misma, otras };
}

export type AnalisisCarta = { carta: CartaMazo; necesarias: number; tengo: number; faltan: number; misma: Carta | null; equivalentes: Carta[]; usadas: { carta: Carta; n: number }[] };
export type AnalisisVariante = { total: number; tengo: number; faltan: number; pct: number; cartas: AnalisisCarta[] };

const IDIOMAS_VALIDOS = new Set(['', 'ES', 'EN']);

/** Copias disponibles por carta del catálogo (internacionales, ES/EN o sin idioma). */
export function copiasDisponibles(cat: Catalogo, entradas: Entrada[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entradas) {
    if (!e.carta_id || !IDIOMAS_VALIDOS.has(e.idioma || '')) continue;
    const c = cat.carta(e.carta_id);
    if (!c || c.sd || c.rg === 'ja') continue;
    m.set(e.carta_id, (m.get(e.carta_id) || 0) + e.cantidad);
  }
  return m;
}

/** Cuánto tengo de una lista: primero la misma impresión, luego equivalentes; cada copia física se usa una sola vez. */
export function analizarVariante(cat: Catalogo, indice: IndiceMazos, cartas: CartaMazo[], entradas: Entrada[]): AnalisisVariante {
  const pool = copiasDisponibles(cat, entradas);
  const tomar = (id: string, n: number) => { const d = Math.min(n, pool.get(id) || 0); if (d > 0) pool.set(id, (pool.get(id) || 0) - d); return d; };
  const res: AnalisisCarta[] = cartas.map(c => { const { misma, otras } = equivalentes(indice, c); return { carta: c, necesarias: c.n, tengo: 0, faltan: c.n, misma, equivalentes: otras, usadas: [] }; });
  // 1) misma impresión
  for (const a of res) if (a.misma) { const d = tomar(a.misma.id, a.faltan); if (d) { a.tengo += d; a.faltan -= d; a.usadas.push({ carta: a.misma, n: d }); } }
  // 2) equivalentes (las más recientes primero)
  for (const a of res) {
    if (!a.faltan) continue;
    const orden = a.equivalentes.slice().sort((x, y) => (cat.setOf(y)?.d || '').localeCompare(cat.setOf(x)?.d || ''));
    for (const eq of orden) { if (!a.faltan) break; const d = tomar(eq.id, a.faltan); if (d) { a.tengo += d; a.faltan -= d; a.usadas.push({ carta: eq, n: d }); } }
  }
  const total = res.reduce((n, a) => n + a.necesarias, 0);
  const tengo = res.reduce((n, a) => n + a.tengo, 0);
  return { total, tengo, faltan: total - tengo, pct: total ? Math.round((tengo / total) * 100) : 0, cartas: res };
}

/** Ids de catálogo (misma impresión o equivalentes) de las cartas que faltan, para consultar precios y el mercado. */
export function idsFaltantes(a: AnalisisVariante): string[] {
  const ids = new Set<string>();
  for (const c of a.cartas) if (c.faltan) { if (c.misma) ids.add(c.misma.id); for (const e of c.equivalentes) ids.add(e.id); }
  return [...ids];
}
