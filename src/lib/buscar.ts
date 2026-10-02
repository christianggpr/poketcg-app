// Búsqueda de cartas en el catálogo y en la colección (misma lógica que PokéBóveda v1).
import { Catalogo, type Carta, type Coleccion, fold, nombreColeccion, numNorm, type IdiomaNombres } from './catalogo';
import type { Entrada } from './coleccion';

type Token = { kind: 'text'; raw: string } | { kind: 'num'; raw: string; norm: string; total?: number };
export type ConsultaParseada = { tokens: Token[]; text: string[]; nums: Token[] };

export function parseQuery(q: string): ConsultaParseada {
  const tokens = fold(q).split(/\s+/).filter(Boolean);
  const out: ConsultaParseada = { tokens: [], text: [], nums: [] };
  for (let t of tokens) {
    t = t.replace(/^#/, '');
    if (!t) continue;
    let m: RegExpExecArray | null;
    if ((m = /^([a-z]{0,4}\d{1,3})\/(\d{1,3})$/.exec(t))) out.tokens.push({ kind: 'num', raw: m[1], norm: numNorm(m[1]), total: parseInt(m[2], 10) });
    else if (/^[a-z]{0,4}\d{1,3}[a-z]?$/.test(t) && /\d/.test(t)) out.tokens.push({ kind: 'num', raw: t, norm: numNorm(t) });
    else out.tokens.push({ kind: 'text', raw: t.replace(/-/g, '') || t });   // Mejoras 4 · D: sin guiones ("ho-oh" → "hooh"; el texto de búsqueda tiene esa variante)
  }
  out.text = out.tokens.filter(x => x.kind === 'text').map(x => x.raw);
  out.nums = out.tokens.filter(x => x.kind === 'num');
  return out;
}

export function matchCard(cat: Catalogo, c: Carta, pq: ConsultaParseada, set: Coleccion | undefined): number {
  const nameT = cat.textoCarta(c);
  const setT = cat.setSearch.get(c.s) || '';
  let score = 0;
  for (const tk of pq.tokens) {
    const t = tk.raw;
    if (tk.kind === 'text') {
      // el id ("sv03.5-006", "sv3pt5-6") se compara sin guiones, como el resto del texto
      const inName = nameT.includes(t), inSet = setT.includes(t), isId = c.id === t || c.id.replace(/-/g, '') === t || (!!c.p && c.p.toLowerCase().replace(/-/g, '') === t);
      if (!inName && !inSet && !isId) return -1;
      if (isId) score += 50;
      if (inName) { score += nameT.startsWith(t) ? 12 : 6; if (nameT === t || nameT.split(' | ').includes(t)) score += 20; }
      else score += 2;
    } else {
      const numOk = numNorm(c.l) === tk.norm;
      const setOk = setT.includes(t);
      if (!numOk && !setOk) return -1;
      score += numOk ? 15 : 4;
      if (tk.total != null && set) { if (set.cc === tk.total || set.ct === tk.total) score += 20; else score -= 5; }
    }
  }
  if (c.sd) score -= 30; // las casillas "sin datos" al final
  return score;
}

const dateScore = (d?: string): number => { const y = parseInt(String(d || '2000').slice(0, 4), 10) || 2000; return (y - 1999) * 0.05; };

export function buscarCatalogo(cat: Catalogo, q: string, limit = 60): { card: Carta; score: number }[] {
  const pq = parseQuery(q);
  if (!pq.tokens.length) return [];
  const res: { card: Carta; score: number }[] = [];
  for (const c of cat.cards) {
    const set = cat.setOf(c);
    const sc = matchCard(cat, c, pq, set);
    if (sc >= 0) res.push({ card: c, score: sc + (set ? dateScore(set.d) : 0) });
  }
  res.sort((a, b) => b.score - a.score);
  return res.slice(0, limit);
}

export function buscarColeccion(cat: Catalogo, entradas: Entrada[], q: string): { entry: Entrada; score: number }[] {
  const pq = parseQuery(q);
  const res: { entry: Entrada; score: number }[] = [];
  for (const e of entradas) {
    const c = cat.carta(e.carta_id);
    let sc: number;
    if (c) sc = matchCard(cat, c, pq, cat.setOf(c));
    else {
      const p = e.personalizada || {};
      const txt = fold([p.nombre, p.coleccion].filter(Boolean).join(' | '));
      const myNum = numNorm(p.numero || '');
      sc = pq.tokens.every(tk => (tk.kind === 'text' ? txt.includes(tk.raw) : myNum === tk.norm || txt.includes(tk.raw))) ? 1 : -1;
    }
    if (sc >= 0) res.push({ entry: e, score: sc });
  }
  res.sort((a, b) => b.score - a.score);
  return res;
}

// ---------------------------------------------------------------------------------------------
// Mejoras 4 · D: búsqueda tolerante a errores en el navegador (sin pg_trgm): sugerencias mientras se escribe y
// "¿Quisiste decir…?" cuando una palabra parece mal escrita ("charisard" → Charizard, "pikachuu" → Pikachu, "evee" → Eevee).
// Índice de nombres distintos del catálogo (cartas en ES/EN/JP, colecciones e ilustradores), construido una vez.
// ---------------------------------------------------------------------------------------------

export type TipoSugerencia = 'carta' | 'coleccion' | 'ilustrador';
export type Sugerencia = { tipo: TipoSugerencia; texto: string; cartas: number; /** id de la colección (tipo coleccion) */ id?: string };
type EntradaIndice = Sugerencia & { clave: string; palabras: string[] };

const indices = new WeakMap<object, EntradaIndice[]>();
/** Nombres distintos del catálogo, con cuántas cartas tiene cada uno. */
export function indiceNombres(cat: Pick<Catalogo, 'cards' | 'sets'>): EntradaIndice[] {
  let idx = indices.get(cat);
  if (idx) return idx;
  const m = new Map<string, EntradaIndice>();
  const add = (tipo: TipoSugerencia, texto: string | undefined, id?: string) => {
    if (!texto) return;
    const clave = fold(texto).replace(/-/g, '');
    if (!clave) return;
    const k = tipo + '|' + clave;
    const e = m.get(k);
    if (e) e.cartas++; else m.set(k, { tipo, texto, cartas: 1, id, clave, palabras: clave.split(/[\s|]+/).filter(Boolean) });
  };
  for (const c of cat.cards) { if (c.sd) continue; add('carta', c.n); add('carta', c.ns); add('carta', c.nj); add('ilustrador', c.il); }
  for (const s of cat.sets) { add('coleccion', s.n, s.id); if (s.ns && s.ns !== s.n) add('coleccion', s.ns, s.id); if (s.ab) add('coleccion', s.ab, s.id); if (s.tid) add('coleccion', s.tid, s.id); }
  idx = [...m.values()];
  indices.set(cat, idx);
  return idx;
}

/** Sugerencias mientras se escribe (prefijo de palabra): cartas primero, luego colecciones e ilustradores; las más comunes antes. */
export function sugerencias(cat: Pick<Catalogo, 'cards' | 'sets'>, q: string, limite = 8): Sugerencia[] {
  const t = fold(q).replace(/-/g, '').trim();
  if (t.length < 2 || /^\d+$/.test(t)) return [];
  const res: { e: EntradaIndice; peso: number }[] = [];
  for (const e of indiceNombres(cat)) {
    let peso = 0;
    if (e.clave === t) peso = 3; else if (e.clave.startsWith(t)) peso = 2; else if (e.palabras.some(p => p.startsWith(t))) peso = 1; else if (t.length >= 4 && e.clave.includes(t)) peso = 0.5;
    if (peso) res.push({ e, peso });
  }
  const orden: Record<TipoSugerencia, number> = { carta: 0, coleccion: 1, ilustrador: 2 };
  res.sort((a, b) => b.peso - a.peso || orden[a.e.tipo] - orden[b.e.tipo] || b.e.cartas - a.e.cartas || a.e.texto.length - b.e.texto.length);
  const vistos = new Set<string>();
  const out: Sugerencia[] = [];
  for (const { e } of res) { const k = e.tipo + '|' + fold(e.texto); if (vistos.has(k)) continue; vistos.add(k); out.push({ tipo: e.tipo, texto: e.texto, cartas: e.cartas, id: e.id }); if (out.length >= limite) break; }
  return out;
}

/** Distancia de Damerau-Levenshtein acotada (se detiene al pasar de `max`). */
export function distancia(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length, lb = b.length;
  let prev2: number[] = [], prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let mejor = i;
    for (let j = 1; j <= lb; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < mejor) mejor = v;
    }
    if (mejor > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}

export type Correccion = { consulta: string; texto: string; tipo: TipoSugerencia; id?: string };
/**
 * "¿Quisiste decir…?": para cada palabra de la consulta que no está en ningún nombre del catálogo, el nombre más parecido
 * (distancia ≤ 2; ≤ 1 en palabras de 4 letras o menos). Devuelve la consulta corregida o null si no hay nada que corregir.
 */
export function quisisteDecir(cat: Catalogo, q: string): Correccion | null {
  const pq = parseQuery(q);
  const idx = indiceNombres(cat);
  const partes = q.trim().split(/\s+/).filter(Boolean);
  let cambio: { texto: string; tipo: TipoSugerencia; id?: string } | null = null;
  const nuevas: string[] = [];
  for (const parte of partes) {
    const tk = pq.tokens.find(x => x.raw === fold(parte).replace(/^#/, '').replace(/-/g, '') || (x.kind === 'num' && x.raw === fold(parte).replace(/^#/, '')));
    if (!tk || tk.kind !== 'text' || tk.raw.length < 3 || /^\d+$/.test(tk.raw)) { nuevas.push(parte); continue; }
    const t = tk.raw;
    // ¿existe tal cual como palabra de algún nombre? ("evee" no: es parte de "eevee", y conviene sugerir Eevee)
    if (idx.some(e => e.palabras.includes(t))) { nuevas.push(parte); continue; }
    const max = t.length <= 4 ? 1 : 2;
    let mejor: { e: EntradaIndice; d: number } | null = null;
    for (const e of idx) {
      // contra el nombre completo y contra cada palabra ("charisard ex" → "charizard")
      let d = distancia(t, e.clave, max);
      for (const p of e.palabras) { if (p.length >= 3) d = Math.min(d, distancia(t, p, max)); if (d === 0) break; }
      if (d > max) continue;
      if (!mejor || d < mejor.d || (d === mejor.d && (e.tipo === 'carta' && mejor.e.tipo !== 'carta' || (e.tipo === mejor.e.tipo && e.cartas > mejor.e.cartas)))) mejor = { e, d };
    }
    if (!mejor) { nuevas.push(parte); continue; }
    // la palabra corregida: la palabra del nombre más parecida (o el nombre entero si es una sola palabra)
    const palabra = mejor.e.palabras.length === 1 ? mejor.e.texto : (mejor.e.texto.split(/\s+/).find(w => distancia(t, fold(w).replace(/-/g, ''), max) <= max) || mejor.e.texto);
    nuevas.push(palabra);
    if (!cambio) cambio = { texto: mejor.e.texto, tipo: mejor.e.tipo, id: mejor.e.id };
  }
  if (!cambio) return null;
  const consulta = nuevas.join(' ');
  return consulta.toLowerCase() === q.trim().toLowerCase() ? null : { consulta, texto: cambio.texto, tipo: cambio.tipo, id: cambio.id };
}

/** Texto para mostrar una sugerencia ("Pikachu", "151 · colección", "Mitsuhiro Arita · ilustrador"). */
export function textoSugerencia(s: Sugerencia, cat: Pick<Catalogo, 'coleccion'>, idioma: IdiomaNombres): string {
  if (s.tipo === 'coleccion') { const set = cat.coleccion(s.id); return set ? nombreColeccion(set, idioma, true) : s.texto; }
  return s.texto;
}
