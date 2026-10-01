// Catálogo de cartas (public/data/catalogo.json): tipos, carga con caché local e índices.
// Funciona en el navegador; las funciones puras también en el servidor y en las pruebas.
import { CATALOGO_VERSION } from './catalogo-version';
export { CATALOGO_VERSION };

export type Coleccion = {
  id: string;
  n: string;          // nombre en inglés
  ns?: string;        // nombre en español
  nj?: string;        // nombre en japonés
  s: string;          // id de la serie
  sn: string;         // nombre de la serie
  sns?: string;       // serie en español
  cc: number;         // total impreso ("/165")
  ct: number;         // total con secretas
  d: string;          // fecha
  tid?: string;       // id en TCGdex (colecciones japonesas)
  rg?: 'ja';          // región: japonesa
  ab?: string;        // código impreso (MEW, PRE…)
  p?: string;         // id en pokemontcg.io
  sym?: string;       // símbolo
  // Imágenes en TCGdex (tools/validar-imagenes.mjs): números SIN imagen en cada idioma.
  ien?: 0 | string[]; // inglés: ausente = todas tienen imagen; 0 = ninguna; lista = todas menos estas
  ies?: 1 | string[]; // español: ausente = ninguna; 1 = todas; lista = todas menos estas
  ija?: 0 | string[]; // japonés (colecciones japonesas): como ien
};

export type Carta = {
  id: string;
  s: string;          // id de la colección
  l: string;          // número impreso ('025', 'TG01')
  n: string;          // nombre en inglés
  ns?: string;
  nj?: string;
  c: 'P' | 'T' | 'E' | '?';
  r?: string;         // rareza
  t?: string[];       // tipos de energía
  dex?: number[];     // n.º de Pokédex nacional
  hp?: number;
  il?: string;        // ilustrador
  rm?: string;        // marca de regulación
  p?: string;         // id en pokemontcg.io
  rg?: 'ja';
  sd?: boolean;       // "sin datos": casilla creada a partir del total oficial
  sinTcgdex?: boolean; // completada a mano: no existe en TCGdex (imagen y precio desde otras fuentes)
  im?: [origen: string, pequena: string, grande?: string]; // imagen de otra fuente pública (Limitless, pokemontcg.io) cuando TCGdex no la tiene; la grande se deduce si falta
};

export type Especie = [number, string, string, string]; // [n.º, inglés, español, japonés]

export type DatosCatalogo = { version: string; generated: string; sets: Coleccion[]; cards: Carta[]; species: Especie[] };

export type IdiomaNombres = 'es' | 'en' | 'ja';

export const fold = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type ClaveNum = [number, string, number, string];
/** Clave de orden de un número impreso: 'TG01' → [1,'TG',1,''], '025' → [0,'',25,''], '?' → [2,'?',0,''] */
export function numKey(l: string | null | undefined): ClaveNum {
  const m = /^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/.exec(String(l || '').trim());
  if (!m) return [2, String(l || ''), 0, ''];
  return [m[1] ? 1 : 0, m[1].toUpperCase(), parseInt(m[2], 10), m[3].toLowerCase()];
}
export function cmpKeys(a: unknown[], b: unknown[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}
/** Forma normalizada de un número: '025' → '25', 'tg01' → 'TG1' */
export function numNorm(l: string): string {
  const k = numKey(l);
  return k[0] === 2 ? k[1].toUpperCase() : k[1] + k[2];
}

export const TYPE_ORDER = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless'];
export const TYPE_ES: Record<string, string> = { Grass: 'Planta', Fire: 'Fuego', Water: 'Agua', Lightning: 'Rayo', Psychic: 'Psíquico', Fighting: 'Lucha', Darkness: 'Oscuridad', Metal: 'Metal', Dragon: 'Dragón', Fairy: 'Hada', Colorless: 'Incolora', Trainer: 'Entrenador', Energy: 'Energía' };
export const RARITY_ES: Record<string, string> = {
  Common: 'Común', Uncommon: 'Poco común', Rare: 'Rara', 'Holo Rare': 'Rara holo', 'Rare Holo': 'Rara holo',
  'Ultra Rare': 'Ultra rara', 'Secret Rare': 'Secreta', 'Double rare': 'Doble rara', 'Illustration rare': 'Ilustración rara',
  'Special illustration rare': 'Ilustración especial rara', 'Hyper rare': 'Híper rara', 'Shiny rare': 'Variocolor rara',
  'Shiny Ultra Rare': 'Variocolor ultra rara', Promo: 'Promo', 'ACE SPEC Rare': 'ACE SPEC', 'Radiant Rare': 'Radiante',
  'Amazing Rare': 'Asombrosa', 'Holo Rare V': 'Rara holo V', 'Holo Rare VMAX': 'Rara holo VMAX', 'Holo Rare VSTAR': 'Rara holo VSTAR'
};
export const rarezaLabel = (r?: string): string => (r ? RARITY_ES[r] || r : '');

export function cardTypeKey(c: Carta | null | undefined): string {
  return !c ? '' : c.c === 'T' ? 'Trainer' : c.c === 'E' ? 'Energy' : c.c === '?' ? '' : (c.t && c.t[0]) || 'Colorless';
}
export const cardTypeLabel = (c: Carta): string => { const k = cardTypeKey(c); return k ? TYPE_ES[k] || k : ''; };
export const dexOf = (c: Carta | null | undefined): number => (c && c.dex && c.dex.length ? c.dex[0] : 0);

/** Índices del catálogo listos para usar. */
export class Catalogo {
  version: string;
  sets: Coleccion[];
  cards: Carta[];
  species: Especie[];
  setsById = new Map<string, Coleccion>();
  cardsById = new Map<string, Carta>();
  cardsBySet = new Map<string, Carta[]>();
  speciesById = new Map<number, Especie>();
  setSearch = new Map<string, string>();
  cardText = new Map<string, string>();
  numIndex = new Map<string, Carta[]>();

  constructor(datos: DatosCatalogo) {
    this.version = datos.version;
    this.sets = datos.sets;
    this.cards = datos.cards;
    this.species = datos.species || [];
    for (const s of this.sets) {
      this.setsById.set(s.id, s);
      this.setSearch.set(s.id, fold([s.n, s.ns, s.nj, s.ab, s.sn, s.sns, s.id, s.tid, s.rg === 'ja' ? 'jp japon japan japonesa 日本' : 'intl internacional'].filter(Boolean).join(' | ')));
    }
    for (const c of this.cards) {
      this.cardsById.set(c.id, c);
      let lista = this.cardsBySet.get(c.s);
      if (!lista) { lista = []; this.cardsBySet.set(c.s, lista); }
      lista.push(c);
      const k = numNorm(c.l);
      let ni = this.numIndex.get(k);
      if (!ni) { ni = []; this.numIndex.set(k, ni); }
      ni.push(c);
    }
    for (const sp of this.species) this.speciesById.set(sp[0], sp);
    // las cartas de cada colección, en orden de número
    for (const lista of this.cardsBySet.values()) {
      const keyed = lista.map(c => ({ c, k: numKey(c.l) }));
      keyed.sort((a, b) => cmpKeys(a.k, b.k));
      lista.splice(0, lista.length, ...keyed.map(x => x.c));
    }
  }

  /** Texto de búsqueda de una carta (nombres en los tres idiomas + nombre de la especie en español). */
  textoCarta(c: Carta): string {
    let t = this.cardText.get(c.id);
    if (t == null) {
      const sp = c.dex && c.dex.length ? this.speciesById.get(c.dex[0]) : undefined;
      t = fold([c.n, c.ns, c.nj, sp && sp[2] !== c.n ? sp[2] : ''].filter(Boolean).join(' | '));
      this.cardText.set(c.id, t);
    }
    return t;
  }
  setOf(c: Carta): Coleccion | undefined { return this.setsById.get(c.s); }
  carta(id: string | null | undefined): Carta | undefined { return id ? this.cardsById.get(id) : undefined; }
  coleccion(id: string | null | undefined): Coleccion | undefined { return id ? this.setsById.get(id) : undefined; }
  cartasDe(setId: string): Carta[] { return this.cardsBySet.get(setId) || []; }
  especie(dex: number): Especie | undefined { return this.speciesById.get(dex); }
}

// ---- nombres e imágenes ---------------------------------------------------------------------

export function nombreCarta(c: Carta, idioma: IdiomaNombres): string {
  if (idioma === 'ja') return c.nj || c.n;
  if (idioma === 'es') return c.ns || c.n;
  return c.n;
}
/** Los otros nombres (hasta dos) para mostrarlos en pequeño: "Pikachu · ピカチュウ" */
export function nombreAlt(c: Carta, idioma: IdiomaNombres): string {
  const main = nombreCarta(c, idioma);
  return [...new Set([c.n, c.ns, c.nj].filter(x => x && x !== main))].slice(0, 2).join(' · ');
}
export function nombreColeccion(s: Coleccion | undefined, idioma: IdiomaNombres, full = false): string {
  if (!s) return '';
  if (s.rg === 'ja') {
    const primary = idioma === 'ja' ? s.nj || s.n : s.n;
    const other = idioma !== 'ja' && s.nj && s.n !== s.nj ? s.nj : idioma === 'ja' && s.n !== s.nj ? s.n : '';
    return full ? `${s.tid} · ${primary}${other ? ' (' + other + ')' : ''}` : `${s.tid} · ${primary}`;
  }
  return idioma === 'es' && s.ns ? s.ns : s.n;
}
export function numLabel(c: Carta, s?: Coleccion): string {
  const total = s && s.cc ? '/' + s.cc : '';
  return `${c.l}${total}`;
}
function tcgdexBase(s: Coleccion, lang: string): string {
  return `https://assets.tcgdex.net/${lang}/${s.s}/${s.tid || s.id}/`;
}
/** Imagen de respaldo en Limitless para cartas japonesas desde la era BW (código sin guiones: SV-P → SVP; número sin ceros). */
export function urlLimitlessJa(c: Carta, s: Coleccion, grande = false): string | null {
  if (s.rg !== 'ja' || !s.tid || !/^\d+$/.test(c.l)) return null;
  const code = s.tid.replace(/-/g, '');
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${code}/${code}_${parseInt(c.l, 10)}_R_JP${grande ? '' : '_LG'}.png`;
}
/** ¿TCGdex tiene la imagen de este número? (listas ien / ija: ausente = todas, 0 = ninguna, lista = todas menos esas) */
const tieneTcgdex = (lista: 0 | string[] | undefined, l: string): boolean => (lista === undefined ? true : lista === 0 ? false : !lista.includes(l));
/** Igual para el español (ies: ausente = ninguna, 1 = todas). */
const tieneTcgdexEs = (lista: 1 | string[] | undefined, l: string): boolean => (lista === 1 ? true : !lista ? false : !lista.includes(l));
export type IdiomaImagen = 'auto' | 'es' | 'en';
/** 'ES' (idioma de una entrada o de un álbum) → 'es'; lo demás → 'auto' (inglés). */
export const idiomaImagen = (idioma?: string | null): IdiomaImagen => (idioma === 'ES' || idioma === 'es' ? 'es' : 'auto');
/** Imagen de otra fuente guardada en el catálogo (im): la pequeña, o la grande deducida de la pequeña. */
function urlIm(c: Carta, grande: boolean): string | null {
  if (!c.im) return null;
  if (!grande) return c.im[1];
  if (c.im[2]) return c.im[2];
  if (c.im[0] === 'limitless') return c.im[1].replace(/_LG\.png$/, '.png');
  if (c.im[0] === 'pokemontcg') return c.im[1].replace(/\.png$/, '_hires.png');
  return c.im[1];
}
function urlPokemontcg(c: Carta, grande: boolean): string | null {
  if (!c.p) return null;
  const i = c.p.indexOf('-');
  return `https://images.pokemontcg.io/${c.p.slice(0, i)}/${c.p.slice(i + 1)}${grande ? '_hires' : ''}.png`;
}
/**
 * URLs candidatas de la imagen de una carta, en el orden en que conviene probarlas (la primera casi siempre existe):
 * TCGdex en el idioma pedido (español si existe, si no inglés; japonés para las japonesas), pokemontcg.io,
 * otra fuente pública guardada en el catálogo (im) y, como último recurso, TCGdex aunque el catálogo diga que no está.
 */
export function urlsImagen(c: Carta, s: Coleccion | undefined, imgLang: IdiomaImagen = 'auto', grande = false): string[] {
  const urls: string[] = [];
  if (!s || c.sd) return urls;
  const calidad = grande ? 'high' : 'low';
  if (s.rg === 'ja') {
    const ja = tcgdexBase(s, 'ja') + c.l + '/' + calidad + '.webp';
    if (tieneTcgdex(s.ija, c.l)) urls.push(ja);
    const im = urlIm(c, grande);
    if (im) urls.push(im);
    else { const lim = urlLimitlessJa(c, s, grande); if (lim) urls.push(lim); }
    if (!tieneTcgdex(s.ija, c.l)) urls.push(ja);
    return urls;
  }
  const en = tcgdexBase(s, 'en') + c.l + '/' + calidad + '.webp';
  const es = tcgdexBase(s, 'es') + c.l + '/' + calidad + '.webp';
  const tieneEn = tieneTcgdex(s.ien, c.l), tieneEs = tieneTcgdexEs(s.ies, c.l);
  if (imgLang === 'es' && tieneEs) urls.push(es);
  if (tieneEn) urls.push(en);
  else if (tieneEs && imgLang !== 'es') urls.push(es); // sin inglés: mejor en español que nada
  const ptcg = urlPokemontcg(c, grande);
  if (ptcg) urls.push(ptcg);
  const im = urlIm(c, grande);
  if (im) urls.push(im);
  if (!tieneEn) urls.push(en);
  return urls;
}
/** URLs de la imagen grande (al abrir la carta); si ninguna carga, se prueban las pequeñas. */
export function urlsImagenGrande(c: Carta, s: Coleccion | undefined, imgLang: IdiomaImagen = 'auto'): string[] {
  return [...new Set([...urlsImagen(c, s, imgLang, true), ...urlsImagen(c, s, imgLang)])];
}
/** Primera imagen grande (compatibilidad). */
export function urlImagenGrande(c: Carta, s: Coleccion | undefined, imgLang: IdiomaImagen = 'auto'): string | null {
  return urlsImagenGrande(c, s, imgLang)[0] || null;
}
export function urlSimbolo(s: Coleccion | undefined): string | null {
  if (!s || s.rg === 'ja') return null;
  return s.sym || `https://assets.tcgdex.net/en/${s.s}/${s.id}/symbol.webp`;
}
/**
 * Mejoras 3 · A: logo oficial de la colección para la portada del álbum: TCGdex (set.logo) y, si no, pokemontcg.io
 * (images.logo). Las colecciones japonesas no tienen logo en ninguna fuente pública (se muestra el nombre).
 */
export function urlsLogo(s: Coleccion | undefined): string[] {
  if (!s || s.rg === 'ja') return [];
  const u = [`https://assets.tcgdex.net/en/${s.s}/${s.id}/logo.webp`];
  if (s.p) u.push(`https://images.pokemontcg.io/${s.p}/logo.png`);
  return u;
}

// ---- orden -----------------------------------------------------------------------------------

export type ModoOrden = 'recent' | 'name' | 'type' | 'value' | 'dex' | 'set';
export const SORT_LABELS: Record<ModoOrden, string> = { recent: 'Recientes', name: 'Nombre', type: 'Tipo', value: 'Valor', dex: 'Pokédex', set: 'Colección y nº' };

export type ExtraOrden = { priceOf?: (c: Carta) => number | null; addedAt?: (c: Carta) => number };

export function cardSortKey(cat: Catalogo, c: Carta, mode: ModoOrden, idioma: IdiomaNombres, extra?: ExtraOrden): unknown[] {
  const s = cat.setOf(c);
  const setKey = [s ? s.d : '9999', s ? s.id : '', ...numKey(c.l)];
  switch (mode) {
    case 'name': return [fold(nombreCarta(c, idioma)), ...setKey];
    case 'type': { const cat2 = c.c === 'P' ? 0 : c.c === 'T' ? 1 : 2; const ti = TYPE_ORDER.indexOf(cardTypeKey(c)); return [cat2, ti < 0 ? 99 : ti, dexOf(c) || 99999, fold(nombreCarta(c, idioma)), ...setKey]; }
    case 'value': { const v = extra && extra.priceOf ? extra.priceOf(c) : null; return [v == null ? 1 : 0, v == null ? 0 : -v, fold(nombreCarta(c, idioma))]; }
    case 'dex': { const d = dexOf(c); return [d ? 0 : c.c === 'P' ? 1 : c.c === 'T' ? 2 : 3, d || 0, fold(nombreCarta(c, idioma)), ...setKey]; }
    case 'recent': return [-(extra && extra.addedAt ? extra.addedAt(c) : 0), ...setKey];
    default: return setKey;
  }
}
export function ordenarCartas(cat: Catalogo, cards: Carta[], mode: ModoOrden, idioma: IdiomaNombres, extra?: ExtraOrden): Carta[] {
  const keyed = cards.map(c => ({ c, k: cardSortKey(cat, c, mode, idioma, extra) }));
  keyed.sort((a, b) => cmpKeys(a.k, b.k));
  return keyed.map(x => x.c);
}
export const matchesType = (c: Carta, type: string): boolean => !type || cardTypeKey(c) === type;

// ---- carga en el navegador (con caché en IndexedDB) ------------------------------------------

const IDB_NOMBRE = 'poketcg';
const IDB_STORE = 'kv';

function abrirIdb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NOMBRE, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbGet<T>(clave: string): Promise<T | null> {
  const db = await abrirIdb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(clave);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbSet(clave: string, valor: unknown): Promise<void> {
  const db = await abrirIdb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      // se borran versiones anteriores del catálogo
      const keys = store.getAllKeys();
      keys.onsuccess = () => { for (const k of keys.result) if (String(k).startsWith('catalogo:') && k !== clave) store.delete(k); };
      store.put(valor, clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

let cargando: Promise<Catalogo> | null = null;

/** Descarga el catálogo (o lo lee de la caché local) y devuelve los índices. */
export function cargarCatalogo(onProgreso?: (texto: string) => void): Promise<Catalogo> {
  if (cargando) return cargando;
  cargando = (async () => {
    const clave = 'catalogo:' + CATALOGO_VERSION;
    let datos = await idbGet<DatosCatalogo>(clave);
    if (!datos || datos.version !== CATALOGO_VERSION) {
      onProgreso?.('Descargando el catálogo de cartas (solo la primera vez)…');
      const r = await fetch(`/data/catalogo.json?v=${encodeURIComponent(CATALOGO_VERSION)}`);
      if (!r.ok) throw new Error('No se pudo descargar el catálogo (' + r.status + ')');
      datos = (await r.json()) as DatosCatalogo;
      idbSet(clave, datos).catch(() => {});
    }
    onProgreso?.('Preparando el catálogo…');
    return new Catalogo(datos);
  })();
  cargando.catch(() => { cargando = null; });
  return cargando;
}
