// Mejoras 4 · C: álbum virtual "Pokédex": una casilla por especie (n.º 0001 → último del catálogo, orden nacional).
// Funciones puras (sin React) para que se puedan probar: generaciones, índice especie → cartas, carta que representa a
// una especie que falta y la carta más valiosa que tengo de una especie.
import type { Carta, Catalogo, Especie } from './catalogo';

export type Generacion = { n: number; desde: number; hasta: number; region: string };
/** Generaciones por n.º de Pokédex nacional (la 9.ª llega hasta el último del catálogo). */
export const GENERACIONES: Generacion[] = [
  { n: 1, desde: 1, hasta: 151, region: 'Kanto' },
  { n: 2, desde: 152, hasta: 251, region: 'Johto' },
  { n: 3, desde: 252, hasta: 386, region: 'Hoenn' },
  { n: 4, desde: 387, hasta: 493, region: 'Sinnoh' },
  { n: 5, desde: 494, hasta: 649, region: 'Teselia' },
  { n: 6, desde: 650, hasta: 721, region: 'Kalos' },
  { n: 7, desde: 722, hasta: 809, region: 'Alola' },
  { n: 8, desde: 810, hasta: 905, region: 'Galar' },
  { n: 9, desde: 906, hasta: 9999, region: 'Paldea' }
];
export const generacionDe = (dex: number): number => GENERACIONES.find(g => dex >= g.desde && dex <= g.hasta)?.n || 0;
/** "0025" */
export const numeroDex = (dex: number): string => String(dex).padStart(4, '0');

/** Especies del catálogo en orden nacional. */
export function especiesOrdenadas(cat: Pick<Catalogo, 'species'>): Especie[] {
  return cat.species.slice().sort((a, b) => a[0] - b[0]);
}

const indices = new WeakMap<object, Map<number, Carta[]>>();
/** Índice especie → cartas del catálogo cuyo dex incluye esa especie (una carta con dos Pokémon cuenta para los dos). Se construye una vez por catálogo. */
export function cartasPorEspecie(cat: Pick<Catalogo, 'cards'>): Map<number, Carta[]> {
  let m = indices.get(cat);
  if (m) return m;
  m = new Map();
  for (const c of cat.cards) {
    if (!c.dex || !c.dex.length || c.sd) continue;
    for (const d of c.dex) { let l = m.get(d); if (!l) { l = []; m.set(d, l); } l.push(c); }
  }
  indices.set(cat, m);
  return m;
}

/** Tipo de energía de una especie: el más frecuente entre sus cartas Pokémon ('' si no se sabe). */
export function tipoEspecie(cartas: Carta[]): string {
  const cuenta = new Map<string, number>();
  for (const c of cartas) { const t = c.c === 'P' && c.t && c.t[0]; if (t) cuenta.set(t, (cuenta.get(t) || 0) + 1); }
  let mejor = '', n = 0;
  for (const [t, k] of cuenta) if (k > n) { mejor = t; n = k; }
  return mejor;
}

/**
 * Carta del catálogo que representa a una especie que falta: la más reciente con imagen, prefiriendo las colecciones
 * internacionales (imagen en inglés/español) y las cartas Pokémon normales (número dentro del total impreso).
 */
export function cartaRepresentativa(cat: Pick<Catalogo, 'setOf'>, cartas: Carta[]): Carta | undefined {
  let mejor: Carta | undefined, mejorClave: [number, number, string] | null = null;
  for (const c of cartas) {
    if (c.sd) continue;
    const s = cat.setOf(c);
    if (!s) continue;
    const num = parseInt(c.l, 10);
    const normal = c.c === 'P' && Number.isFinite(num) && (!s.cc || num <= s.cc) ? 1 : 0;
    const clave: [number, number, string] = [s.rg === 'ja' ? 0 : 1, normal, s.d || ''];
    if (!mejorClave || clave[0] > mejorClave[0] || (clave[0] === mejorClave[0] && (clave[1] > mejorClave[1] || (clave[1] === mejorClave[1] && clave[2] > mejorClave[2])))) { mejor = c; mejorClave = clave; }
  }
  return mejor;
}

export type CopiaValorada<E> = { entrada: E; carta: Carta; pen: number; fecha: string };
/** La copia más valiosa (a igual precio, la de colección más reciente). */
export function masValiosa<E>(copias: CopiaValorada<E>[]): CopiaValorada<E> | undefined {
  let mejor: CopiaValorada<E> | undefined;
  for (const x of copias) if (!mejor || x.pen > mejor.pen || (x.pen === mejor.pen && x.fecha > mejor.fecha)) mejor = x;
  return mejor;
}
