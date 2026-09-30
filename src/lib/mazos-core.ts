// Mazos meta (Fase 2 · D): tipos y funciones puras compartidas entre servidor, cliente y pruebas.

/** Carta de una lista tal como la publica Limitless: código del set (TWM), número, copias, nombre, categoría. */
export type CartaMazo = { set: string; num: string; n: number; nombre: string; cat: 'P' | 'T' | 'E' };

export type Arquetipo = { id: number; nombre: string; iconos: string[]; orden: number; puntos: number | null; cuota: number | null; formato: string; actualizado: string };
export type Variante = { id: string; arquetipo_id: number; nombre: string; lista_id: number | null; n_listas: number; mejor_puesto: number | null; cartas: CartaMazo[]; orden: number; jugador: string | null; torneo: string | null; actualizado: string };
export type ListaMazo = { id: number; arquetipo_id: number; jugador: string | null; torneo: string | null; puesto: number | null; fecha: string | null; iconos: string[]; cartas: CartaMazo[] };

const quitarEtiquetas = (s: string) => s.replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Página /decks?format=standard → arquetipos ordenados por puntos (id, nombre, iconos, puntos, cuota %). */
export function parsearArquetipos(html: string): Omit<Arquetipo, 'formato' | 'actualizado'>[] {
  const res: Omit<Arquetipo, 'formato' | 'actualizado'>[] = [];
  const filas = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const tr of filas) {
    const m = /<a href="\/decks\/(\d+)[^"]*">([\s\S]*?)<\/a>/.exec(tr);
    if (!m) continue;
    const celdas = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(quitarEtiquetas);
    const iconos = [...tr.matchAll(/<img class="pokemon"[^>]*alt="([^"]*)"/g)].map(x => x[1]);
    const puntos = parseInt(celdas[3] || '', 10);
    const cuota = parseFloat((celdas[4] || '').replace('%', ''));
    res.push({ id: parseInt(m[1], 10), nombre: quitarEtiquetas(m[2]), iconos, orden: res.length + 1, puntos: isNaN(puntos) ? null : puntos, cuota: isNaN(cuota) ? null : cuota });
  }
  return res;
}

/** Página /decks/<id> → últimas listas (id, puesto, jugador, torneo, iconos de la variante). */
export function parsearListasDeArquetipo(html: string): { id: number; puesto: number | null; jugador: string; torneo: string; iconos: string[] }[] {
  const res: { id: number; puesto: number | null; jugador: string; torneo: string; iconos: string[] }[] = [];
  const tabla = /<table[\s\S]*?<\/table>/.exec(html.slice(html.indexOf('Latest results') >= 0 ? html.indexOf('Latest results') : 0))?.[0] || '';
  let torneo = '';
  for (const tr of tabla.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const sub = /<th class="sub-heading"[^>]*>([\s\S]*?)<\/th>/.exec(tr);
    if (sub) { torneo = quitarEtiquetas(sub[1]); continue; }
    const lista = /<a href="\/decks\/list\/(\d+)"/.exec(tr);
    if (!lista) continue;
    const celdas = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []);
    const puesto = parseInt(quitarEtiquetas(celdas[1] || ''), 10);
    const iconos = [...(celdas[2] || '').matchAll(/alt="([^"]*)"/g)].map(x => x[1]);
    const jugador = quitarEtiquetas(celdas[3] || '');
    res.push({ id: parseInt(lista[1], 10), puesto: isNaN(puesto) ? null : puesto, jugador, torneo, iconos });
  }
  return res;
}

/** Página /decks/list/<id> → cartas de la lista (la categoría sale del encabezado de cada columna). */
export function parsearLista(html: string): { titulo: string; cartas: CartaMazo[] } {
  const titulo = quitarEtiquetas(/<div class="decklist-title">([\s\S]*?)<a /.exec(html)?.[1] || /<title>([^<]*)<\/title>/.exec(html)?.[1] || '');
  const cartas: CartaMazo[] = [];
  let cat: CartaMazo['cat'] = 'P';
  const re = /<div class="decklist-column-heading">([\s\S]*?)<\/div>|<div class="decklist-card"([^>]*)>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) { const enc = quitarEtiquetas(m[1]); cat = /^Pok/i.test(enc) ? 'P' : /^Energ/i.test(enc) ? 'E' : 'T'; continue; }
    const set = /data-set="([^"]*)"/.exec(m[2])?.[1] || '';
    const num = /data-number="([^"]*)"/.exec(m[2])?.[1] || '';
    const n = parseInt(quitarEtiquetas(/<span class="card-count">([\s\S]*?)<\/span>/.exec(m[3])?.[1] || '0'), 10);
    const nombre = quitarEtiquetas(/<span class="card-name">([\s\S]*?)<\/span>/.exec(m[3])?.[1] || '');
    if (!set || !num || !n || !nombre) continue;
    cartas.push({ set: set.toUpperCase(), num, n, nombre, cat });
  }
  return { titulo, cartas };
}

const claveCarta = (c: CartaMazo) => `${c.set}|${c.num.replace(/^0+(?=\d)/, '')}`;

/** Coincidencia entre dos listas: cartas en común (misma impresión) sobre 60. */
export function coincidencia(a: CartaMazo[], b: CartaMazo[]): number {
  const mb = new Map<string, number>();
  for (const c of b) mb.set(claveCarta(c), (mb.get(claveCarta(c)) || 0) + c.n);
  let comun = 0, total = 0;
  for (const c of a) { comun += Math.min(c.n, mb.get(claveCarta(c)) || 0); total += c.n; }
  return total ? comun / Math.max(total, 60) : 0;
}

const capitalizar = (s: string) => s.split(/[-_ ]+/).filter(Boolean).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

/** Agrupa las listas de un arquetipo en variantes: una lista se une a la variante cuyo representante coincide ≥ umbral. */
export function agruparVariantes<T extends { id: number; puesto: number | null; iconos: string[]; cartas: CartaMazo[] }>(listas: T[], nombreArquetipo: string, umbral = 0.9): { nombre: string; representante: T; listas: T[]; mejorPuesto: number | null }[] {
  const ordenadas = listas.slice().sort((a, b) => (a.puesto ?? 9999) - (b.puesto ?? 9999) || b.id - a.id);
  const grupos: { nombre: string; representante: T; listas: T[]; mejorPuesto: number | null }[] = [];
  for (const l of ordenadas) {
    if (!l.cartas.length) continue;
    const g = grupos.find(x => coincidencia(x.representante.cartas, l.cartas) >= umbral);
    if (g) { g.listas.push(l); continue; }
    grupos.push({ nombre: '', representante: l, listas: [l], mejorPuesto: l.puesto });
  }
  // nombres: iconos de Limitless (p. ej. dragapult + dusknoir → "Dragapult Dusknoir"); si se repiten, se numeran
  const usados = new Map<string, number>();
  for (const g of grupos) {
    const base = g.representante.iconos.length > 1 ? g.representante.iconos.map(capitalizar).join(' ') : nombreArquetipo;
    const n = (usados.get(base) || 0) + 1; usados.set(base, n);
    g.nombre = n === 1 ? base : `${base} · variante ${n}`;
  }
  return grupos;
}

/** Diferencias entre dos listas: cartas que sobran/faltan respecto a `base`. */
export function diferencias(base: CartaMazo[], otra: CartaMazo[]): { carta: CartaMazo; delta: number }[] {
  const m = new Map<string, { carta: CartaMazo; a: number; b: number }>();
  for (const c of base) { const k = claveCarta(c); const x = m.get(k) || { carta: c, a: 0, b: 0 }; x.a += c.n; m.set(k, x); }
  for (const c of otra) { const k = claveCarta(c); const x = m.get(k) || { carta: c, a: 0, b: 0 }; x.b += c.n; m.set(k, x); }
  return [...m.values()].filter(x => x.a !== x.b).map(x => ({ carta: x.carta, delta: x.b - x.a })).sort((p, q) => q.delta - p.delta);
}
