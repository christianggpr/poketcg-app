// Huellas visuales ("firmas") de las cartas para identificar por imagen: se calculan una vez por
// colección a partir de las imágenes de TCGdex y se guardan en IndexedDB de este dispositivo.
// Fase 2 · E: además se comparten entre usuarios en Supabase Storage (bucket `huellas`): quien
// prepara una colección la sube, y los demás la descargan en segundos en vez de recalcularla.
import type { Catalogo, Carta, Coleccion } from './catalogo';
import { urlLimitlessJa } from './catalogo';
import { supabaseBrowser } from './supabase/client';
import { cargarVision, type VisionApi, type VisionIndex } from './vision';

export const BUCKET_HUELLAS = 'huellas';
const MAGIA = 'PKH1';
export type CabeceraHuellas = { v: number; set: string; sigLen: number; ids: string[]; count: number; total: number; ts: number; cat?: string };

export const rutaHuellas = (setId: string, v: number) => `v${v}/${encodeURIComponent(setId)}.bin`;

/** Archivo binario: 'PKH1' + longitud de cabecera (4 bytes) + cabecera JSON + huellas concatenadas. */
export function empaquetarHuellas(cab: CabeceraHuellas, sigs: { id: string; sig: Uint8Array }[]): Uint8Array {
  const porId = new Map(sigs.map(s => [s.id, s.sig]));
  const cabBytes = new TextEncoder().encode(JSON.stringify(cab));
  const out = new Uint8Array(8 + cabBytes.length + cab.ids.length * cab.sigLen);
  out.set(new TextEncoder().encode(MAGIA), 0);
  new DataView(out.buffer).setUint32(4, cabBytes.length);
  out.set(cabBytes, 8);
  let p = 8 + cabBytes.length;
  for (const id of cab.ids) { out.set(porId.get(id)!, p); p += cab.sigLen; }
  return out;
}
export function desempaquetarHuellas(buf: ArrayBuffer): { cab: CabeceraHuellas; sigs: { id: string; sig: Uint8Array }[] } | null {
  try {
    const bytes = new Uint8Array(buf);
    if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIA) return null;
    const n = new DataView(buf).getUint32(4);
    const cab = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + n))) as CabeceraHuellas;
    if (!cab || !Array.isArray(cab.ids) || bytes.length < 8 + n + cab.ids.length * cab.sigLen) return null;
    const sigs = cab.ids.map((id, i) => ({ id, sig: bytes.slice(8 + n + i * cab.sigLen, 8 + n + (i + 1) * cab.sigLen) }));
    return { cab, sigs };
  } catch { return null; }
}

/** Descarga las huellas compartidas de una colección (o null si nadie las subió aún). */
export async function descargarHuellasCompartidas(setId: string, v: number): Promise<{ cab: CabeceraHuellas; sigs: { id: string; sig: Uint8Array }[] } | null> {
  try {
    const url = supabaseBrowser().storage.from(BUCKET_HUELLAS).getPublicUrl(rutaHuellas(setId, v)).data.publicUrl + '?t=' + Math.floor(Date.now() / 3600000);
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return desempaquetarHuellas(await r.arrayBuffer());
  } catch { return null; }
}

/** Sube las huellas de una colección para que los demás usuarios no tengan que calcularlas. */
export async function subirHuellasCompartidas(cab: CabeceraHuellas, sigs: { id: string; sig: Uint8Array }[]): Promise<boolean> {
  try {
    const bytes = empaquetarHuellas(cab, sigs);
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' });
    const { error } = await supabaseBrowser().storage.from(BUCKET_HUELLAS).upload(rutaHuellas(cab.set, cab.v), blob, { upsert: true, contentType: 'application/octet-stream', cacheControl: '3600' });
    return !error;
  } catch { return false; }
}

const DB_NOMBRE = 'poketcg-huellas';

export type MetaColeccion = { id: string; count: number; total: number; ts: number; v: number; stale?: boolean };
type FilaHuella = { id: string; set: string; sig: Uint8Array };

let dbPromise: Promise<IDBDatabase> | null = null;
function abrir(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return; }
    const req = indexedDB.open(DB_NOMBRE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const s = db.createObjectStore('sigs', { keyPath: 'id' });
      s.createIndex('set', 'set', { unique: false });
      db.createObjectStore('sigsets', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return abrir().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('abortada'));
  }));
}

export const almacenHuellas = {
  putSigs: (setId: string, items: { id: string; sig: Uint8Array }[]) => tx<void>('sigs', 'readwrite', s => { for (const it of items) s.put({ id: it.id, set: setId, sig: it.sig }); }),
  getAllSigs: () => tx<FilaHuella[]>('sigs', 'readonly', s => s.getAll() as IDBRequest<FilaHuella[]>),
  deleteSigsBySet: (setId: string) => tx<void>('sigs', 'readwrite', s => {
    const req = s.index('set').openKeyCursor(IDBKeyRange.only(setId));
    req.onsuccess = () => { const c = req.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
  }),
  putSigSet: (meta: MetaColeccion) => tx<void>('sigsets', 'readwrite', s => { s.put(meta); }),
  getSigSets: async (): Promise<MetaColeccion[]> => { try { return await tx<MetaColeccion[]>('sigsets', 'readonly', s => s.getAll() as IDBRequest<MetaColeccion[]>); } catch { return []; } },
  deleteSigSet: (id: string) => tx<void>('sigsets', 'readwrite', s => { s.delete(id); }),
  clear: async () => { await tx<void>('sigs', 'readwrite', s => { s.clear(); }); await tx<void>('sigsets', 'readwrite', s => { s.clear(); }); },
  estimate: async (): Promise<{ usage?: number } | null> => { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch { return null; } }
};

/** URLs con CORS para calcular la huella (TCGdex y, si existe, pokemontcg.io). */
export function urlsHuella(c: Carta, s: Coleccion | undefined): string[] {
  if (!s || c.sd) return [];
  const lang = s.rg === 'ja' ? 'ja' : 'en';
  const base = `https://assets.tcgdex.net/${lang}/${s.s}/${s.tid || s.id}/`;
  const urls = c.sinTcgdex ? [] : [base + c.l + '/low.webp', base + c.l + '/low.png', base + c.l + '/high.webp'];
  if (c.p) { const i = c.p.indexOf('-'); urls.push(`https://images.pokemontcg.io/${c.p.slice(0, i)}/${c.p.slice(i + 1)}.png`); }
  const lim = urlLimitlessJa(c, s);
  if (lim) urls.push(lim);
  return urls;
}

/** Índice de huellas en memoria + colecciones preparadas (una instancia por página). */
export class Reconocedor {
  vision: VisionApi | null = null;
  index: VisionIndex | null = null;
  prepared = new Map<string, MetaColeccion>();
  stale: string[] = [];
  cargado = false;
  private cargando: Promise<void> | null = null;
  ocupado = false;
  cancelar = false;
  listeners = new Set<() => void>();

  private avisar() { for (const f of this.listeners) f(); }

  async load(): Promise<void> {
    if (this.cargado) return;
    if (this.cargando) return this.cargando;
    this.cargando = (async () => {
      this.vision = await cargarVision();
      this.index = new this.vision.Index();
      try {
        const metas = await almacenHuellas.getSigSets();
        for (const m of metas) this.prepared.set(m.id, m);
        const all = await almacenHuellas.getAllSigs();
        const valid = new Map<string, number>();
        for (const r of all) {
          if (r.sig && r.sig.length === this.vision.SIG_LEN) { this.index.add(r.id, r.set, r.sig); valid.set(r.set, (valid.get(r.set) || 0) + 1); }
        }
        this.index.build();
        this.stale = [];
        for (const m of metas) if (m.count && !valid.get(m.id)) { m.stale = true; this.stale.push(m.id); }
      } catch (e) { console.warn('No se pudieron cargar las huellas', e); }
      this.cargado = true;
      this.avisar();
    })();
    return this.cargando;
  }
  get cartasIndexadas(): number { return this.index ? this.index.rows.length : 0; }
  listo(): boolean { return this.cartasIndexadas > 0; }

  /** Origen de la última preparación: 'compartidas' (descargadas) o 'calculadas' (en este dispositivo y subidas). */
  ultimoOrigen: 'compartidas' | 'calculadas' | null = null;

  async prepararColeccion(cat: Catalogo, setId: string, onProgress: (done: number, total: number) => void, opts: { compartir?: boolean } = {}): Promise<MetaColeccion | null> {
    await this.load();
    const vision = this.vision!, index = this.index!;
    const cards = cat.cartasDe(setId).filter(c => !c.sd);
    const set = cat.coleccion(setId);
    const compartir = opts.compartir !== false;
    let sigs: { id: string; sig: Uint8Array }[] | null = null;
    // 1) huellas compartidas por otro usuario (misma versión, misma cantidad de cartas, casi completas)
    if (compartir) {
      onProgress(0, cards.length);
      const comp = await descargarHuellasCompartidas(setId, vision.SIG_VERSION);
      const ids = new Set(cards.map(c => c.id));
      if (comp && comp.cab.sigLen === vision.SIG_LEN && comp.cab.total === cards.length && comp.sigs.length >= cards.length * 0.9 && comp.sigs.every(s => ids.has(s.id))) { sigs = comp.sigs; this.ultimoOrigen = 'compartidas'; onProgress(cards.length, cards.length); }
    }
    if (this.cancelar) return null;
    // 2) si no, se calculan aquí (y se comparten)
    let calculadas = false;
    if (!sigs) {
      const items = cards.map(c => ({ id: c.id, urls: urlsHuella(c, set) }));
      sigs = await vision.computeSignatures(items, onProgress, 4, () => this.cancelar);
      calculadas = true; this.ultimoOrigen = 'calculadas';
    }
    if (this.cancelar) return null;
    await almacenHuellas.deleteSigsBySet(setId);
    await almacenHuellas.putSigs(setId, sigs);
    const meta: MetaColeccion = { id: setId, count: sigs.length, total: cards.length, ts: Date.now(), v: vision.SIG_VERSION };
    await almacenHuellas.putSigSet(meta);
    if (calculadas && compartir && sigs.length) subirHuellasCompartidas({ v: vision.SIG_VERSION, set: setId, sigLen: vision.SIG_LEN, ids: sigs.map(s => s.id), count: sigs.length, total: cards.length, ts: meta.ts }, sigs).catch(() => {});
    this.prepared.set(setId, meta);
    this.stale = this.stale.filter(id => id !== setId);
    index.removeSet(setId);
    for (const s of sigs) index.add(s.id, setId, s.sig);
    index.build();
    this.avisar();
    return meta;
  }
  async quitarColeccion(setId: string): Promise<void> {
    await this.load();
    await almacenHuellas.deleteSigsBySet(setId);
    await almacenHuellas.deleteSigSet(setId);
    this.prepared.delete(setId);
    this.stale = this.stale.filter(id => id !== setId);
    this.index!.removeSet(setId);
    this.index!.build();
    this.avisar();
  }
  async borrarTodo(): Promise<void> {
    await this.load();
    await almacenHuellas.clear();
    this.prepared.clear(); this.stale = [];
    this.index = new this.vision!.Index();
    this.index.build();
    this.avisar();
  }
}

let unico: Reconocedor | null = null;
/** Reconocedor compartido por toda la app (las huellas se cargan una sola vez). */
export function reconocedor(): Reconocedor {
  if (!unico) unico = new Reconocedor();
  return unico;
}
