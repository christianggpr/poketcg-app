// Huellas visuales ("firmas") de las cartas para identificar por imagen: se calculan una vez por
// colección a partir de las imágenes de TCGdex y se guardan en IndexedDB de este dispositivo.
import type { Catalogo, Carta, Coleccion } from './catalogo';
import { cargarVision, type VisionApi, type VisionIndex } from './vision';

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
  const urls = [base + c.l + '/low.webp', base + c.l + '/low.png', base + c.l + '/high.webp'];
  if (c.p) { const i = c.p.indexOf('-'); urls.push(`https://images.pokemontcg.io/${c.p.slice(0, i)}/${c.p.slice(i + 1)}.png`); }
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

  async prepararColeccion(cat: Catalogo, setId: string, onProgress: (done: number, total: number) => void): Promise<MetaColeccion | null> {
    await this.load();
    const vision = this.vision!, index = this.index!;
    const cards = cat.cartasDe(setId).filter(c => !c.sd);
    const set = cat.coleccion(setId);
    const items = cards.map(c => ({ id: c.id, urls: urlsHuella(c, set) }));
    const sigs = await vision.computeSignatures(items, onProgress, 4, () => this.cancelar);
    if (this.cancelar) return null;
    await almacenHuellas.deleteSigsBySet(setId);
    await almacenHuellas.putSigs(setId, sigs);
    const meta: MetaColeccion = { id: setId, count: sigs.length, total: cards.length, ts: Date.now(), v: vision.SIG_VERSION };
    await almacenHuellas.putSigSet(meta);
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
