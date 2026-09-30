// Carga de public/lib/vision.js (identificación por imagen y OCR heredados de PokéBóveda v1) y tipos.
import type { Catalogo } from './catalogo';
import { numNorm } from './catalogo';

export type Fuente = HTMLCanvasElement | HTMLVideoElement | HTMLImageElement;
export type Rect = { x: number; y: number; w: number; h: number };
export type ResultadoOCR = { num: string; total: string | number; weak?: boolean; lang?: string; setCode?: string; codeRaw?: string; langTpl?: unknown };
export type ResultadoIdioma = { lang?: string; how?: string; raw?: string; hits?: unknown; tried?: unknown; strips?: unknown };
export type PasadaOCR = { mode?: string; text?: string; strip?: string; band?: number[]; x?: number[]; ms?: number; lines?: string[]; fastError?: string };
export type Rectificada = { canvas: HTMLCanvasElement; w: number; h: number; region: unknown; quality?: number; ratio?: number };

export interface VisionIndex {
  ids: string[];
  sets: string[];
  rows: Float32Array[];
  add(id: string, setId: string, sig: Uint8Array): void;
  build(): VisionIndex;
  removeSet(setId: string): void;
  search(queries: Float32Array[], topK: number, setFilter?: ((setId: string) => boolean) | null): { id: string; set: string; sim: number }[];
  simFor(queries: Float32Array[], id: string): number | null;
}
export interface VisionOCR {
  worker: unknown;
  failed: boolean;
  knownTotals: Set<number> | null;
  knownPrefixes: Set<string> | null;
  knownSetCodes: Set<string> | null;
  isSupported(): boolean;
  ensure(onStatus?: (m: { status: string; progress?: number }) => void): Promise<unknown>;
  readNumber(source: Fuente, sx: number, sy: number, sw: number, sh: number, onStatus: null | ((s: string) => void), diag: PasadaOCR[], opts: { budgetMs?: number; keepStrips?: boolean; region?: unknown }): Promise<ResultadoOCR | null>;
  detectLanguage(source: Fuente, sx: number, sy: number, sw: number, sh: number, region: unknown, timeLeft: () => number, opts: { keepStrips?: boolean }): Promise<ResultadoIdioma | null>;
}
export interface VisionApi {
  SIG_LEN: number;
  SIG_VERSION: number;
  Index: new () => VisionIndex;
  OCR: VisionOCR;
  queryVariants(source: Fuente, sx: number, sy: number, sw: number, sh: number): Float32Array[];
  computeSignatures(items: { id: string; urls: string[] }[], onProgress: (done: number, total: number) => void, concurrency: number, shouldStop: () => boolean): Promise<{ id: string; sig: Uint8Array }[]>;
  rectifyCard(source: Fuente, r: Rect): Rectificada | null;
}

declare global {
  interface Window { Vision?: VisionApi; VISION_LIB_BASE?: string; Tesseract?: unknown }
}

let cargando: Promise<VisionApi> | null = null;

/** Inyecta /lib/vision.js una sola vez y devuelve la API. */
export function cargarVision(): Promise<VisionApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('solo en el navegador'));
  if (window.Vision) return Promise.resolve(window.Vision);
  if (cargando) return cargando;
  cargando = new Promise<VisionApi>((resolve, reject) => {
    window.VISION_LIB_BASE = '/lib/tesseract/';
    const s = document.createElement('script');
    s.src = '/lib/vision.js';
    s.async = true;
    s.onload = () => (window.Vision ? resolve(window.Vision) : reject(new Error('vision.js no definió window.Vision')));
    s.onerror = () => reject(new Error('No se pudo cargar /lib/vision.js'));
    document.head.appendChild(s);
  });
  cargando.catch(() => { cargando = null; });
  return cargando;
}

/** Datos del catálogo que ayudan al OCR (totales impresos, prefijos TG/SWSH…, códigos MEW/PRE…). */
export function configurarOcr(vision: VisionApi, cat: Catalogo): void {
  if (vision.OCR.knownTotals) return;
  vision.OCR.knownTotals = new Set(cat.sets.flatMap(s => [s.cc, s.ct]).filter(n => n >= 10));
  const prefijos = new Set<string>();
  for (const c of cat.cards) { const m = /^([A-Z]+)\d/.exec(numNorm(c.l)); if (m) prefijos.add(m[1]); }
  vision.OCR.knownPrefixes = prefijos;
  vision.OCR.knownSetCodes = new Set(cat.sets.map(s => s.ab).filter((x): x is string => !!x).map(x => x.toUpperCase()));
}

/** Preferencias locales del escáner (por dispositivo). */
export const prefs = {
  get ocr(): boolean { try { return localStorage.getItem('poketcg:ocr') !== '0'; } catch { return true; } },
  set ocr(v: boolean) { try { localStorage.setItem('poketcg:ocr', v ? '1' : '0'); } catch { /* sin almacenamiento */ } },
  get scanSet(): string { try { return localStorage.getItem('poketcg:scanSet') || ''; } catch { return ''; } },
  set scanSet(v: string) { try { localStorage.setItem('poketcg:scanSet', v); } catch { /* sin almacenamiento */ } }
};
