// Búsqueda de cartas en el catálogo y en la colección (misma lógica que PokéBóveda v1).
import { Catalogo, type Carta, type Coleccion, fold, numNorm } from './catalogo';
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
    else out.tokens.push({ kind: 'text', raw: t });
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
      const inName = nameT.includes(t), inSet = setT.includes(t), isId = c.id === t || (!!c.p && c.p.toLowerCase() === t);
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
