// Identificación de una foto: enderezado, huellas visuales, lectura del número (OCR), fusión de
// candidatas y detección del idioma. Misma lógica que PokéBóveda v1.7 (Scan.identify).
import type { Catalogo, Carta } from './catalogo';
import { numNorm } from './catalogo';
import { APP_VERSION } from './config';
import type { Reconocedor } from './huellas';
import { configurarOcr, type Fuente, type PasadaOCR, type Rect, type ResultadoOCR } from './vision';

export type Candidata = { card: Carta; sim: number; score: number; num: boolean; tot: boolean; code?: boolean; conf: 'hi' | 'mid' | 'lo' };
export type Diagnostico = Record<string, unknown> & { ocrPasses: PasadaOCR[]; prepared: { sets: number; cards: number }; rectified: boolean };
export type ResultadoIdentificacion = {
  list: Candidata[];
  ocr: ResultadoOCR | null;
  lang: string;
  langPending: boolean;
  visualCount: number;
  shot: string;          // vista previa (jpeg data URL)
  shotFull: string | null;
  diag: Diagnostico;
};

export type OpcionesIdentificar = {
  ocr: boolean;
  scanSet: string;
  onEstado?: (texto: string) => void;
  streamInfo?: unknown;
};

export async function identificar(cat: Catalogo, rec: Reconocedor, source: Fuente, r: Rect, opts: OpcionesIdentificar): Promise<ResultadoIdentificacion> {
  await rec.load();
  const vision = rec.vision!;
  configurarOcr(vision, cat);
  const srcW = (source as HTMLCanvasElement).width || (source as HTMLVideoElement).videoWidth;
  const srcH = (source as HTMLCanvasElement).height || (source as HTMLVideoElement).videoHeight;
  const t0 = performance.now();
  const diag: Diagnostico = { app: APP_VERSION, source: { w: srcW, h: srcH }, guide: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }, stream: opts.streamInfo || null, rectified: false, ocrPasses: [], ocrError: null, visualMs: 0, ocrMs: 0, prepared: { sets: rec.prepared.size, cards: rec.cartasIndexadas } };
  opts.onEstado?.('Enderezando la carta…');

  // 0) detección de bordes + corrección de perspectiva (si falla, se usa el recorte de la guía)
  let src: Fuente = source, rect = r, rcRegion: unknown = null;
  try {
    const rc = vision.rectifyCard(source, r);
    if (rc) { src = rc.canvas; rect = { x: 0, y: 0, w: rc.w, h: rc.h }; rcRegion = rc.region; diag.rectified = true; diag.rectQuality = rc.quality; diag.rectSize = [rc.w, rc.h]; diag.rectRatio = rc.ratio; }
  } catch (e) { diag.rectError = String(e); }

  // vistas previas
  const prev = document.createElement('canvas'); prev.width = 126; prev.height = 176;
  prev.getContext('2d')!.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, 126, 176);
  const shot = prev.toDataURL('image/jpeg', 0.8);
  let shotFull: string | null = null;
  try { const big = document.createElement('canvas'); big.width = 1100; big.height = 1537; big.getContext('2d')!.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, 1100, 1537); shotFull = big.toDataURL('image/jpeg', 0.9); } catch { shotFull = null; }

  const setFilter = opts.scanSet ? (s: string) => s === opts.scanSet : null;

  // 1) visual
  let visual: { id: string; sim: number }[] = [];
  let qs: Float32Array[] | null = null;
  try {
    if (rec.listo()) {
      const t1 = performance.now();
      qs = vision.queryVariants(src, rect.x, rect.y, rect.w, rect.h);
      visual = rec.index!.search(qs, 12, setFilter);
      diag.visualMs = Math.round(performance.now() - t1);
    }
  } catch (e) { diag.visualError = String(e); }

  // 2) OCR del número impreso
  let ocr: ResultadoOCR | null = null;
  const ocrOk = opts.ocr && vision.OCR.isSupported();
  if (ocrOk) {
    opts.onEstado?.('Leyendo el número impreso…');
    const t2 = performance.now();
    try {
      ocr = await Promise.race([vision.OCR.readNumber(src, rect.x, rect.y, rect.w, rect.h, null, diag.ocrPasses, { budgetMs: 18000, keepStrips: true, region: rcRegion }), new Promise<null>(res => setTimeout(() => res(null), 26000))]);
    } catch (e) { diag.ocrError = String((e as Error)?.message || e); }
    if ((!ocr || ocr.weak) && diag.rectified && performance.now() - t2 < 9000) {
      try {
        const passes2: PasadaOCR[] = [];
        const ocr2 = await Promise.race([vision.OCR.readNumber(source, r.x, r.y, r.w, r.h, null, passes2, { budgetMs: 9000 }), new Promise<null>(res => setTimeout(() => res(null), 12000))]);
        diag.ocrRetry = { passes: passes2.length, result: ocr2 && `${ocr2.num}/${ocr2.total}${ocr2.weak ? ' (dudoso)' : ''}` };
        if (ocr2 && (!ocr || !ocr2.weak)) ocr = ocr2;
      } catch (e) { diag.ocrRetryError = String((e as Error)?.message || e); }
    }
    diag.ocrMs = Math.round(performance.now() - t2);
  }
  const lang = (ocr && ocr.lang) || '';
  diag.lang = { code: (ocr && ocr.setCode) || '', codeRaw: (ocr && ocr.codeRaw) || '', fromCode: lang, result: lang };

  // 3) fusión de candidatas
  type K = { card: Carta; sim: number; score: number; num: boolean; tot: boolean; code?: boolean };
  const cands = new Map<string, K>();
  for (const v of visual) { const card = cat.carta(v.id); if (card) cands.set(v.id, { card, sim: v.sim, score: v.sim, num: false, tot: false }); }
  if (ocr) {
    const n = numNorm(String(ocr.num)), tot = parseInt(String(ocr.total).replace(/\D/g, ''), 10);
    const pool = cat.numIndex.get(n) || [];
    for (const c of pool) {
      if (c.sd) continue;
      if (setFilter && !setFilter(c.s)) continue;
      const s = cat.setOf(c);
      const totOk = !!(s && tot && (s.cc === tot || s.ct === tot));
      if (!cands.has(c.id)) {
        let sim = 0;
        if (qs) { const v = rec.index!.simFor(qs, c.id); if (v !== null) sim = Math.max(0, v); }
        cands.set(c.id, { card: c, sim, score: sim, num: false, tot: false });
      }
      const k = cands.get(c.id)!; k.num = true; k.tot = totOk;
    }
    const strong = !ocr.weak;
    const code = (ocr.setCode || '').toUpperCase();
    for (const k of cands.values()) {
      if (k.num) k.score += k.tot ? (strong ? 0.30 : 0.15) : strong ? 0.12 : 0.06;
      else if (tot) { const s = cat.setOf(k.card); if (s && (s.cc === tot || s.ct === tot)) { k.tot = true; k.score += strong ? 0.04 : 0.02; } }
      if (code && k.num) { const s = cat.setOf(k.card); if (s && String(s.ab || '').toUpperCase() === code) { k.code = true; k.score += 0.2; } }
    }
  }
  const ordenadas = [...cands.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const list: Candidata[] = ordenadas.map((k, i) => {
    const gap = k.score - (ordenadas[i + 1] ? ordenadas[i + 1].score : 0);
    const numOk = k.num && !(ocr && ocr.weak);
    const conf: Candidata['conf'] = (k.sim >= 0.75 && (numOk || gap >= 0.10)) || (k.sim >= 0.6 && numOk && k.tot) ? 'hi' : k.sim >= 0.65 || (numOk && k.tot) ? 'mid' : 'lo';
    return { ...k, conf };
  });
  diag.totalMs = Math.round(performance.now() - t0);
  diag.candidates = list.slice(0, 5).map(k => ({ id: k.card.id, name: k.card.n, sim: +k.sim.toFixed(3), score: +k.score.toFixed(3), num: k.num, tot: k.tot, code: !!k.code }));
  diag.ocr = ocr; diag.setFilter = opts.scanSet || null;
  diag.ua = navigator.userAgent; diag.ocrSupported = vision.OCR.isSupported(); diag.ocrLoaded = !!vision.OCR.worker; diag.ocrFailed = vision.OCR.failed;

  const resultado: ResultadoIdentificacion = { list, ocr, lang, langPending: !lang && ocrOk, visualCount: visual.length, shot, shotFull, diag };
  // 4) idioma en segundo plano (no retrasa los resultados)
  if (!lang && ocrOk) {
    resultado.langPending = true;
    resultado.diag.langPromise = detectarIdioma(vision, src, rect, rcRegion, resultado);
  }
  return resultado;
}

async function detectarIdioma(vision: import('./vision').VisionApi, src: Fuente, rect: Rect, region: unknown, R: ResultadoIdentificacion): Promise<string> {
  const t3 = performance.now();
  let lang = '';
  const dl = R.diag.lang as Record<string, unknown>;
  try {
    const ll = await Promise.race([vision.OCR.detectLanguage(src, rect.x, rect.y, rect.w, rect.h, region, () => 9000 - (performance.now() - t3), { keepStrips: true }), new Promise<null>(res => setTimeout(() => res(null), 11000))]);
    if (ll) { lang = ll.lang || ''; dl.detect = { lang: ll.lang, how: ll.how, raw: (ll.raw || '').slice(0, 120), hits: ll.hits, tried: ll.tried }; }
  } catch (e) { dl.detectError = String((e as Error)?.message || e); }
  dl.detectMs = Math.round(performance.now() - t3);
  dl.result = lang;
  R.lang = lang; R.langPending = false;
  return lang;
}

export const NOMBRES_IDIOMA: Record<string, string> = { ES: 'español', EN: 'inglés', FR: 'francés', DE: 'alemán', IT: 'italiano', PT: 'portugués', JP: 'japonés', KO: 'coreano', ZH: 'chino' };
