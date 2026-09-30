/* PokéTCG (heredado de PokéBóveda v1.7) — visión
 *
 * Identificación de cartas por imagen:
 *  1) Cada carta de la base de datos se reduce a una "huella visual" (miniatura en gris de la carta
 *     completa + miniatura de la ilustración + rejilla de color). Se calcula una vez por colección
 *     descargando las imágenes oficiales y se guarda en IndexedDB.
 *  2) La foto/cámara se recorta con la guía, se calculan las mismas huellas (con pequeñas variaciones
 *     de encuadre) y se comparan por correlación contra todas las cartas preparadas.
 *  3) Opcionalmente, OCR (Tesseract.js) lee el número impreso "025/165" para reforzar el resultado.
 */
(function () {
  'use strict';

  const TW = 16, TH = 22;          // miniatura (proporción de carta 63x88)
  const CW = 4, CH = 4;            // rejilla de color
  const N_GRAY = TW * TH;          // 352
  const N_COL = CW * CH * 3;       // 48
  const STAGE_W = 128, STAGE_H = 176;
  const HC = 16;                   // celda de orientaciones (px del lienzo intermedio)
  const HC_W = STAGE_W / HC, HC_H = STAGE_H / HC, H_BINS = 8; // 8x11 celdas x 8 orientaciones
  const N_HOG = HC_W * HC_H * H_BINS; // 704
  const OFF_HOG = N_GRAY * 2 + N_COL; // 752
  const SIG_LEN = OFF_HOG + N_HOG;    // 1456
  const ART = { x: 0.06, y: 0.105, w: 0.88, h: 0.375 }; // zona de la ilustración (cartas normales)

  const canvases = {};
  function cv(key, w, h) {
    let c = canvases[key];
    if (!c) { c = document.createElement('canvas'); canvases[key] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

  // Dibuja un recorte de la fuente (img/video/canvas) en el lienzo intermedio 128x176.
  function stage(source, sx, sy, sw, sh) {
    const c = cv('stage', STAGE_W, STAGE_H);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.fillStyle = '#808080'; x.fillRect(0, 0, STAGE_W, STAGE_H);
    x.drawImage(source, sx, sy, sw, sh, 0, 0, STAGE_W, STAGE_H);
    return c;
  }

  function grayFrom(src, sx, sy, sw, sh, key) {
    const c = cv(key, TW, TH);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, sx, sy, sw, sh, 0, 0, TW, TH);
    const d = x.getImageData(0, 0, TW, TH).data;
    const out = new Uint8Array(N_GRAY);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
    return out;
  }
  function colorFrom(src) {
    const c = cv('col', CW, CH);
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, STAGE_W, STAGE_H, 0, 0, CW, CH);
    const d = x.getImageData(0, 0, CW, CH).data;
    const out = new Uint8Array(N_COL);
    for (let i = 0, j = 0; i < d.length; i += 4) { out[j++] = d[i]; out[j++] = d[i + 1]; out[j++] = d[i + 2]; }
    return out;
  }

  // Histograma de orientaciones de borde por celda (HOG reducido) sobre el lienzo 128x176.
  // Solo depende de dónde hay bordes y en qué dirección, no del brillo: aguanta reflejos del
  // holo, sombras y cuerpos de carta que salen oscuros en la foto (reverse holo).
  const hogGray = new Float32Array(STAGE_W * STAGE_H);
  const hogHist = new Float32Array(N_HOG);
  function hogFrom(st) {
    const d = ctx2d(st).getImageData(0, 0, STAGE_W, STAGE_H).data;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) hogGray[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    hogHist.fill(0);
    const W = STAGE_W;
    for (let y = 1; y < STAGE_H - 1; y++) {
      const cy = (y / HC) | 0;
      for (let x = 1; x < W - 1; x++) {
        const gx = hogGray[y * W + x + 1] - hogGray[y * W + x - 1];
        const gy = hogGray[(y + 1) * W + x] - hogGray[(y - 1) * W + x];
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag < 2) continue;
        let ang = Math.atan2(gy, gx); if (ang < 0) ang += Math.PI; // sin signo: 0..π
        const b = ang / Math.PI * H_BINS;
        let b0 = b | 0; const f = b - b0; if (b0 >= H_BINS) b0 = 0;
        const cell = (cy * HC_W + ((x / HC) | 0)) * H_BINS;
        hogHist[cell + b0] += mag * (1 - f);
        hogHist[cell + ((b0 + 1) % H_BINS)] += mag * f;
      }
    }
    // normalización por celda relativa al contraste medio de la carta: las celdas planas
    // quedan cerca de 0 y las que tienen bordes valen ~1 aunque el contraste sea bajo.
    const nCells = HC_W * HC_H; const norms = new Float32Array(nCells); let meanNorm = 0;
    for (let c = 0; c < nCells; c++) { let s = 0; for (let k = 0; k < H_BINS; k++) { const v = hogHist[c * H_BINS + k]; s += v * v; } norms[c] = Math.sqrt(s); meanNorm += norms[c]; }
    meanNorm /= nCells;
    const eps2 = Math.pow(0.25 * meanNorm + 1e-3, 2);
    const out = new Uint8Array(N_HOG);
    for (let c = 0; c < nCells; c++) {
      const inv = 1 / Math.sqrt(norms[c] * norms[c] + eps2);
      for (let k = 0; k < H_BINS; k++) out[c * H_BINS + k] = Math.min(255, Math.round(hogHist[c * H_BINS + k] * inv * 255));
    }
    return out;
  }

  // Huella (Uint8Array de SIG_LEN) a partir del lienzo intermedio.
  function signatureFromStage(st) {
    const sig = new Uint8Array(SIG_LEN);
    sig.set(grayFrom(st, 0, 0, STAGE_W, STAGE_H, 'g1'), 0);
    sig.set(grayFrom(st, ART.x * STAGE_W, ART.y * STAGE_H, ART.w * STAGE_W, ART.h * STAGE_H, 'g2'), N_GRAY);
    sig.set(colorFrom(st), N_GRAY * 2);
    sig.set(hogFrom(st), OFF_HOG);
    return sig;
  }
  function signature(source, sx, sy, sw, sh) {
    return signatureFromStage(stage(source, sx, sy, sw, sh));
  }

  // Normaliza cada bloque (media 0, norma 1) → Float32Array para comparar por correlación.
  function normalizeBlock(sig, from, len, out, outFrom) {
    let mean = 0;
    for (let i = 0; i < len; i++) mean += sig[from + i];
    mean /= len;
    let ss = 0;
    for (let i = 0; i < len; i++) { const v = sig[from + i] - mean; out[outFrom + i] = v; ss += v * v; }
    const inv = ss > 1e-6 ? 1 / Math.sqrt(ss) : 0;
    for (let i = 0; i < len; i++) out[outFrom + i] *= inv;
  }
  // Filtro paso-alto: a cada píxel de la miniatura se le resta la media de su vecindario
  // (2r+1)x(2r+1), recortado a los bordes. Elimina sombras e iluminación desigual de la foto
  // (que no existen en la imagen de referencia) y deja solo la estructura local de la carta.
  const HP_R = 3;
  const hpSat = new Float32Array((TW + 1) * (TH + 1));
  function highPassBlock(sig, from, out, outFrom) {
    const W1 = TW + 1;
    // tabla de sumas acumuladas
    for (let x = 0; x <= TW; x++) hpSat[x] = 0;
    for (let y = 1; y <= TH; y++) {
      let row = 0; hpSat[y * W1] = 0;
      for (let x = 1; x <= TW; x++) {
        row += sig[from + (y - 1) * TW + (x - 1)];
        hpSat[y * W1 + x] = hpSat[(y - 1) * W1 + x] + row;
      }
    }
    for (let y = 0; y < TH; y++) {
      const y0 = Math.max(0, y - HP_R), y1 = Math.min(TH, y + HP_R + 1);
      for (let x = 0; x < TW; x++) {
        const x0 = Math.max(0, x - HP_R), x1 = Math.min(TW, x + HP_R + 1);
        const sum = hpSat[y1 * W1 + x1] - hpSat[y0 * W1 + x1] - hpSat[y1 * W1 + x0] + hpSat[y0 * W1 + x0];
        out[outFrom + y * TW + x] = sig[from + y * TW + x] - sum / ((y1 - y0) * (x1 - x0));
      }
    }
  }
  const hpTmp = new Float32Array(N_GRAY);
  function normalizeGray(sig, from, out, outFrom) {
    highPassBlock(sig, from, hpTmp, 0);
    normalizeBlock(hpTmp, 0, N_GRAY, out, outFrom);
  }
  function normalizeSig(sig) {
    const out = new Float32Array(SIG_LEN);
    normalizeGray(sig, 0, out, 0);
    normalizeGray(sig, N_GRAY, out, N_GRAY);
    // color: relativo al brillo medio, luego normalizado
    const tmp = new Float32Array(N_COL);
    let mean = 0;
    for (let i = 0; i < N_COL; i++) mean += sig[N_GRAY * 2 + i];
    mean = mean / N_COL || 1;
    for (let i = 0; i < N_COL; i++) tmp[i] = sig[N_GRAY * 2 + i] / mean;
    normalizeBlock(tmp, 0, N_COL, out, N_GRAY * 2);
    // orientaciones de borde: media 0, norma 1
    normalizeBlock(sig, OFF_HOG, N_HOG, out, OFF_HOG);
    return out;
  }

  // Pesos de cada bloque en la similitud final (suman 1).
  // Ajustados con fotos reales (reverse holo con reflejos) y cartas sintéticas: la ilustración y los
  // bordes mandan; el color y la carta completa pesan poco porque los reflejos del holo los alteran.
  let W_FULL = 0.15, W_ART = 0.35, W_COL = 0.05, W_HOG = 0.45;
  function setWeights(w) { W_FULL = w.full; W_ART = w.art; W_COL = w.col; W_HOG = w.hog; }

  // Índice en memoria de huellas normalizadas.
  class Index {
    constructor() { this.ids = []; this.sets = []; this.rows = []; this.mat = null; this.n = 0; }
    add(id, setId, sig) { this.ids.push(id); this.sets.push(setId); this.rows.push(normalizeSig(sig)); this.mat = null; }
    removeSet(setId) {
      const keep = [];
      for (let i = 0; i < this.ids.length; i++) if (this.sets[i] !== setId) keep.push(i);
      this.ids = keep.map(i => this.ids[i]); this.sets = keep.map(i => this.sets[i]); this.rows = keep.map(i => this.rows[i]);
      this.mat = null;
    }
    build() {
      this.n = this.rows.length;
      this.mat = new Float32Array(this.n * SIG_LEN);
      this.pos = new Map();
      for (let i = 0; i < this.n; i++) { this.mat.set(this.rows[i], i * SIG_LEN); this.pos.set(this.ids[i], i); }
      return this;
    }
    // Similitud (mejor variante) de la consulta contra una carta concreta; null si no está preparada.
    simFor(queries, id) {
      if (!this.mat) this.build();
      const i = this.pos.get(id);
      if (i === undefined) return null;
      let best = -9;
      for (const q of queries) { const s = this.sim(q, i); if (s > best) best = s; }
      return best;
    }
    // Similitud de una consulta normalizada contra la fila i.
    sim(q, i) {
      const m = this.mat, o = i * SIG_LEN;
      let a = 0, b = 0, c = 0, d = 0;
      for (let k = 0; k < N_GRAY; k++) a += q[k] * m[o + k];
      for (let k = N_GRAY; k < N_GRAY * 2; k++) b += q[k] * m[o + k];
      for (let k = N_GRAY * 2; k < OFF_HOG; k++) c += q[k] * m[o + k];
      for (let k = OFF_HOG; k < SIG_LEN; k++) d += q[k] * m[o + k];
      return W_FULL * a + W_ART * b + W_COL * c + W_HOG * d;
    }
    // Similitud por bloques (para diagnóstico y ajuste): [completa, ilustración, color, bordes]
    simParts(q, i) {
      const m = this.mat, o = i * SIG_LEN;
      let a = 0, b = 0, c = 0, d = 0;
      for (let k = 0; k < N_GRAY; k++) a += q[k] * m[o + k];
      for (let k = N_GRAY; k < N_GRAY * 2; k++) b += q[k] * m[o + k];
      for (let k = N_GRAY * 2; k < OFF_HOG; k++) c += q[k] * m[o + k];
      for (let k = OFF_HOG; k < SIG_LEN; k++) d += q[k] * m[o + k];
      return [a, b, c, d];
    }
    /**
     * Busca las mejores coincidencias.
     * @param {Float32Array[]} queries variantes normalizadas de la consulta (la primera es la central)
     * @param {number} topK
     * @param {(setId:string)=>boolean} [setFilter]
     */
    search(queries, topK, setFilter) {
      if (!this.mat) this.build();
      const n = this.n;
      if (!n) return [];
      const q0 = queries[0];
      // pasada 1: variante central sobre todo el índice
      const s1 = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (setFilter && !setFilter(this.sets[i])) { s1[i] = -9; continue; }
        s1[i] = this.sim(q0, i);
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => s1[b] - s1[a]).slice(0, 250);
      // pasada 2: todas las variantes sobre los mejores
      const res = order.map(i => {
        let best = s1[i];
        for (let v = 1; v < queries.length; v++) { const s = this.sim(queries[v], i); if (s > best) best = s; }
        return { id: this.ids[i], set: this.sets[i], sim: best };
      });
      res.sort((a, b) => b.sim - a.sim);
      return res.slice(0, topK);
    }
  }

  // Variantes de encuadre para tolerar pequeños desajustes de la guía.
  const VARIANTS = [
    [0, 0, 1], [0.035, 0, 1], [-0.035, 0, 1], [0, 0.035, 1], [0, -0.035, 1],
    [0, 0, 0.94], [0, 0, 1.06], [0.03, 0.03, 1], [-0.03, -0.03, 1], [0.03, -0.03, 1], [-0.03, 0.03, 1]
  ];
  function queryVariants(source, sx, sy, sw, sh) {
    const out = [];
    for (const [dx, dy, s] of VARIANTS) {
      const w = sw * s, h = sh * s;
      const x = sx + dx * sw + (sw - w) / 2, y = sy + dy * sh + (sh - h) / 2;
      out.push(normalizeSig(signature(source, x, y, w, h)));
    }
    return out;
  }

  // ---------- Detección de bordes de la carta + corrección de perspectiva ----------
  // Busca los 4 bordes de la carta cerca de la guía y "endereza" la carta a un rectángulo canónico.
  // Devuelve null si no se detecta con confianza (entonces se usa el recorte de la guía tal cual).
  function srcSize(source) {
    return { w: source.videoWidth || source.naturalWidth || source.width, h: source.videoHeight || source.naturalHeight || source.height };
  }
  function fitLine(points) {
    // points: [[t, p]] → p = a*t + b (mínimos cuadrados con rechazo de atípicos)
    let pts = points.slice();
    let a = 0, b = 0;
    for (let round = 0; round < 3; round++) {
      const n = pts.length; if (n < 6) return null;
      let st = 0, sp = 0, stt = 0, stp = 0;
      for (const [t, p] of pts) { st += t; sp += p; stt += t * t; stp += t * p; }
      const den = n * stt - st * st; if (Math.abs(den) < 1e-9) return null;
      a = (n * stp - st * sp) / den; b = (sp - a * st) / n;
      const res = pts.map(([t, p]) => Math.abs(p - (a * t + b)));
      const sorted = res.slice().sort((x, y) => x - y);
      const med = sorted[sorted.length >> 1];
      const thr = Math.max(1.5, 3 * med);
      const keep = pts.filter((_, i) => res[i] <= thr);
      if (keep.length === pts.length) break;
      pts = keep;
    }
    return { a, b, inliers: pts.length, total: points.length };
  }
  function rectifyCard(source, r) {
    const { w: SW, h: SH } = srcSize(source);
    if (!SW || !SH) return null;
    const pad = 0.18;
    let Rx = r.x - r.w * pad, Ry = r.y - r.h * pad, Rw = r.w * (1 + 2 * pad), Rh = r.h * (1 + 2 * pad);
    if (Rx < 0) { Rw += Rx; Rx = 0; } if (Ry < 0) { Rh += Ry; Ry = 0; }
    if (Rx + Rw > SW) Rw = SW - Rx; if (Ry + Rh > SH) Rh = SH - Ry;
    if (Rw < 40 || Rh < 40) return null;
    // 1) imagen de trabajo en gris (≈340 px de ancho)
    const WW = 340, s = WW / Rw, WH = Math.max(40, Math.round(Rh * s));
    const wc = cv('rect-work', WW, WH), wx = ctx2d(wc);
    wx.imageSmoothingEnabled = true; wx.imageSmoothingQuality = 'high';
    wx.drawImage(source, Rx, Ry, Rw, Rh, 0, 0, WW, WH);
    const wd = wx.getImageData(0, 0, WW, WH).data;
    const g0 = new Float32Array(WW * WH);
    for (let i = 0, j = 0; i < wd.length; i += 4, j++) g0[j] = (wd[i] * 77 + wd[i + 1] * 151 + wd[i + 2] * 28) >> 8;
    // suavizado 3x3
    const g = new Float32Array(WW * WH);
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      if (y === 0 || x === 0 || y === WH - 1 || x === WW - 1) { g[y * WW + x] = g0[y * WW + x]; continue; }
      let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += g0[(y + dy) * WW + x + dx];
      g[y * WW + x] = sum / 9;
    }
    const gx0 = (r.x - Rx) * s, gy0 = (r.y - Ry) * s, gx1 = (r.x + r.w - Rx) * s, gy1 = (r.y + r.h - Ry) * s;
    const gw = gx1 - gx0, gh = gy1 - gy0;
    const MIN_GRAD = 10, MIN_GRAD_OUT = 6;
    const gradAt = (vertical, t, p) => {
      if (vertical) {
        if (t < 1 || t > WH - 2 || p < 1 || p > WW - 2) return 0;
        return (Math.abs(g[t * WW + p + 1] - g[t * WW + p - 1]) + Math.abs(g[(t - 1) * WW + p + 1] - g[(t - 1) * WW + p - 1]) + Math.abs(g[(t + 1) * WW + p + 1] - g[(t + 1) * WW + p - 1])) / 3;
      }
      if (t < 1 || t > WW - 2 || p < 1 || p > WH - 2) return 0;
      return (Math.abs(g[(p + 1) * WW + t] - g[(p - 1) * WW + t]) + Math.abs(g[(p + 1) * WW + t - 1] - g[(p - 1) * WW + t - 1]) + Math.abs(g[(p + 1) * WW + t + 1] - g[(p - 1) * WW + t + 1])) / 3;
    };
    // Busca el borde vertical (x ≈ xExp) recorriendo filas, o el horizontal (y ≈ yExp) recorriendo columnas.
    // 1) el borde más marcado cerca de la guía (suele ser el marco interior de la carta);
    // 2) luego mira hacia fuera por si hay un borde paralelo más débil: el borde exterior real de la carta
    //    (p. ej. borde plateado sobre una mesa clara), y lo prefiere si es consistente.
    const findEdge = (vertical, exp, from, to, band, outward) => {
      const size = vertical ? gw : gh;
      const pts = [];
      const sigma = band * 0.55;
      const maxP = (vertical ? WW : WH) - 2;
      for (let t = Math.round(from); t <= to; t += 2) {
        let best = -1, bestP = 0;
        for (let p = Math.max(1, Math.round(exp - band)); p <= Math.min(maxP, Math.round(exp + band)); p++) {
          const grad = gradAt(vertical, t, p);
          if (grad < MIN_GRAD) continue;
          const d = (p - exp) / sigma;
          const score = grad * Math.exp(-0.5 * d * d);
          if (score > best) { best = score; bestP = p; }
        }
        if (best > 0) pts.push([t, bestP]);
      }
      if (pts.length < 8) return null;
      const line = fitLine(pts);
      if (!line || line.inliers < 8 || line.inliers < pts.length * 0.5) return null;
      // 2) borde paralelo hacia fuera (entre 1.5% y 10% del tamaño de la carta)
      const near = Math.max(2, size * 0.015), far = size * 0.10;
      const pts2 = [];
      for (let t = Math.round(from); t <= to; t += 2) {
        const p1 = line.a * t + line.b;
        let best = -1, bestP = 0;
        const pa = Math.round(p1 + outward * near), pb = Math.round(p1 + outward * far);
        for (let p = Math.min(pa, pb); p <= Math.max(pa, pb); p++) {
          if (p < 1 || p > maxP) continue;
          const grad = gradAt(vertical, t, p);
          if (grad < MIN_GRAD_OUT) continue;
          if (grad > best) { best = grad; bestP = p; }
        }
        if (best > 0) pts2.push([t, bestP]);
      }
      if (pts2.length >= Math.max(8, pts.length * 0.6)) {
        const line2 = fitLine(pts2);
        if (line2 && line2.inliers >= pts2.length * 0.6 && Math.abs(line2.a - line.a) < 0.04) {
          const off = Math.abs(line2.b - line.b);
          if (off >= near * 0.8 && off <= far * 1.1) { line2.alt = line; return line2; } // alt: el borde interior, por si el exterior es una funda o sombra
        }
      }
      return line; // p = a*t + b
    };
    const left = findEdge(true, gx0, gy0 + gh * 0.08, gy1 - gh * 0.08, gw * 0.16, -1);
    const right = findEdge(true, gx1, gy0 + gh * 0.08, gy1 - gh * 0.08, gw * 0.16, 1);
    let top = findEdge(false, gy0, gx0 + gw * 0.08, gx1 - gw * 0.08, gh * 0.13, -1);
    let bottom = findEdge(false, gy1, gx0 + gw * 0.08, gx1 - gw * 0.08, gh * 0.13, 1);
    if (!left || !right) return null;
    // intersección: vertical x = a1*y + b1, horizontal y = a2*x + b2
    const inter = (v, h) => { const den = 1 - v.a * h.a; if (Math.abs(den) < 1e-6) return null; const x = (v.a * h.b + v.b) / den; return [x, h.a * x + h.b]; };
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const ASPECT = 88 / 63;
    const quadOf = (t, b) => {
      if (!t || !b) return null;
      const TL = inter(left, t), TR = inter(right, t), BR = inter(right, b), BL = inter(left, b);
      if (!TL || !TR || !BR || !BL) return null;
      const wTop = dist(TL, TR), wBot = dist(BL, BR), hL = dist(TL, BL), hR = dist(TR, BR);
      const wAvg = (wTop + wBot) / 2, hAvg = (hL + hR) / 2;
      return { TL, TR, BR, BL, wTop, wBot, hL, hR, wAvg, hAvg, ratio: hAvg / wAvg };
    };
    let q = quadOf(top, bottom);
    // Bordes "exteriores" dudosos: si el cuadrilátero se aleja de la proporción de una carta y con el borde
    // interior (el marcado, `alt`) se acerca claramente, el exterior era una funda, una sombra o la mesa.
    {
      const dev = (qq) => qq ? Math.abs(qq.ratio - ASPECT) : Infinity;
      const alts = [];
      if (bottom && bottom.alt) alts.push(quadOf(top, bottom.alt));
      if (top && top.alt) alts.push(quadOf(top.alt, bottom));
      if (top && top.alt && bottom && bottom.alt) alts.push(quadOf(top.alt, bottom.alt));
      if (dev(q) > 0.02) for (const a of alts) if (a && dev(a) < dev(q) - 0.01) q = a;
    }
    // Si la proporción no es la de una carta (88/63), uno de los bordes horizontales es un marco interior o
    // se salió de la banda: se vuelve a buscar el borde superior (o inferior) donde la geometría dice que debe estar.
    const xmid = (gx0 + gx1) / 2;
    const bad = (qq) => !qq || qq.ratio < 1.3 || qq.ratio > 1.5;
    if (bad(q)) {
      const wRef = Math.abs((right.a * (gy0 + gy1) / 2 + right.b) - (left.a * (gy0 + gy1) / 2 + left.b));
      const tries = [];
      if (bottom) { const yb = bottom.a * xmid + bottom.b; const t2 = findEdge(false, yb - ASPECT * wRef, gx0 + gw * 0.08, gx1 - gw * 0.08, gh * 0.07, -1); tries.push(quadOf(t2, bottom)); }
      if (top) { const yt = top.a * xmid + top.b; const b2 = findEdge(false, yt + ASPECT * wRef, gx0 + gw * 0.08, gx1 - gw * 0.08, gh * 0.07, 1); tries.push(quadOf(top, b2)); }
      let best = bad(q) ? null : q;
      for (const t of tries) { if (!t || bad(t)) continue; if (!best || Math.abs(t.ratio - ASPECT) < Math.abs(best.ratio - ASPECT)) best = t; }
      q = best;
    }
    if (!q) return null;
    const { TL, TR, BR, BL, wTop, wBot, hL, hR, wAvg, hAvg, ratio } = q;
    const inBounds = (p) => p[0] > -WW * 0.05 && p[0] < WW * 1.05 && p[1] > -WH * 0.05 && p[1] < WH * 1.05;
    if (!(inBounds(TL) && inBounds(TR) && inBounds(BR) && inBounds(BL))) return null;
    if (Math.abs(wTop - wBot) > wAvg * 0.22 || Math.abs(hL - hR) > hAvg * 0.22) return null;
    if (ratio < 1.3 || ratio > 1.5) return null;
    if (wAvg < gw * 0.6 || wAvg > gw * 1.5 || hAvg < gh * 0.6 || hAvg > gh * 1.5) return null;
    // 2) homografía cuadrado unidad → cuadrilátero (en coordenadas de la región a resolución completa)
    const P = [TL, TR, BR, BL].map(p => [p[0] / s, p[1] / s]);
    const [x0, y0] = P[0], [x1, y1] = P[1], [x2, y2] = P[2], [x3, y3] = P[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, gg, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; gg = 0; hh = 0; }
    else {
      const den = dx1 * dy2 - dx2 * dy1; if (Math.abs(den) < 1e-9) return null;
      gg = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + gg * x1; b = x3 - x0 + hh * x3; c = x0; d = y1 - y0 + gg * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    // 3) remuestreo bilineal desde la región a resolución completa
    const OW = Math.min(1100, Math.max(400, Math.round(wAvg / s))), OH = Math.round(OW * 88 / 63);
    const fc = cv('rect-src', Math.round(Rw), Math.round(Rh)), fx = ctx2d(fc);
    fx.drawImage(source, Rx, Ry, Rw, Rh, 0, 0, fc.width, fc.height);
    const src = fx.getImageData(0, 0, fc.width, fc.height).data, sw = fc.width, sh = fc.height;
    const oc = cv('rect-out', OW, OH), ox = ctx2d(oc);
    const out = ox.createImageData(OW, OH), od = out.data;
    for (let j = 0; j < OH; j++) {
      const v = (j + 0.5) / OH;
      for (let i = 0; i < OW; i++) {
        const u = (i + 0.5) / OW;
        const den = gg * u + hh * v + 1;
        const x = (a * u + b * v + c) / den, y = (d * u + e * v + f) / den;
        const xi = Math.floor(x), yi = Math.floor(y);
        const o = (j * OW + i) * 4;
        if (xi < 0 || yi < 0 || xi >= sw - 1 || yi >= sh - 1) { od[o] = od[o + 1] = od[o + 2] = 128; od[o + 3] = 255; continue; }
        const fx1 = x - xi, fy1 = y - yi, fx0 = 1 - fx1, fy0 = 1 - fy1;
        const p00 = (yi * sw + xi) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
        od[o] = src[p00] * fx0 * fy0 + src[p10] * fx1 * fy0 + src[p01] * fx0 * fy1 + src[p11] * fx1 * fy1;
        od[o + 1] = src[p00 + 1] * fx0 * fy0 + src[p10 + 1] * fx1 * fy0 + src[p01 + 1] * fx0 * fy1 + src[p11 + 1] * fx1 * fy1;
        od[o + 2] = src[p00 + 2] * fx0 * fy0 + src[p10 + 2] * fx1 * fy0 + src[p01 + 2] * fx0 * fy1 + src[p11 + 2] * fx1 * fy1;
        od[o + 3] = 255;
      }
    }
    ox.putImageData(out, 0, 0);
    const corners = P.map(p => [p[0] + Rx, p[1] + Ry]);
    const qz = (l) => l ? +(l.inliers / l.total).toFixed(2) : null;
    // Remuestrea una zona de la carta (fracciones u/v del lienzo canónico) directamente desde la foto a
    // resolución completa (para el OCR del número: más detalle que el lienzo de 1100 px).
    const region = (u0, v0, u1, v1, outW, slot) => {
      const outH = Math.round(outW * ((v1 - v0) * 88 / 63) / (u1 - u0));
      const map = (u, v) => { const den = gg * u + hh * v + 1; return [(a * u + b * v + c) / den, (d * u + e * v + f) / den]; };
      const pts = [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)];
      const bx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])) - 2)), bx1 = Math.min(Math.round(Rw) - 1, Math.ceil(Math.max(...pts.map(p => p[0])) + 2));
      const by0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1])) - 2)), by1 = Math.min(Math.round(Rh) - 1, Math.ceil(Math.max(...pts.map(p => p[1])) + 2));
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
      if (bw < 4 || bh < 4 || outW < 4 || outH < 4) return null;
      const sc = cv('rect-region-src' + (slot || 0), bw, bh), sx2 = ctx2d(sc);
      sx2.drawImage(source, Rx + bx0, Ry + by0, bw, bh, 0, 0, bw, bh);
      const sd = sx2.getImageData(0, 0, bw, bh).data;
      const rc2 = cv('rect-region-out' + (slot || 0), outW, outH), rx = ctx2d(rc2);
      const o2 = rx.createImageData(outW, outH), d2 = o2.data;
      for (let j = 0; j < outH; j++) {
        const v = v0 + (v1 - v0) * (j + 0.5) / outH;
        for (let i = 0; i < outW; i++) {
          const u = u0 + (u1 - u0) * (i + 0.5) / outW;
          const den = gg * u + hh * v + 1;
          const x = (a * u + b * v + c) / den - bx0, y = (d * u + e * v + f) / den - by0;
          const xi = Math.floor(x), yi = Math.floor(y), o = (j * outW + i) * 4;
          if (xi < 0 || yi < 0 || xi >= bw - 1 || yi >= bh - 1) { d2[o] = d2[o + 1] = d2[o + 2] = 128; d2[o + 3] = 255; continue; }
          const fx1 = x - xi, fy1 = y - yi, fx0 = 1 - fx1, fy0 = 1 - fy1;
          const p00 = (yi * bw + xi) * 4, p10 = p00 + 4, p01 = p00 + bw * 4, p11 = p01 + 4;
          d2[o] = sd[p00] * fx0 * fy0 + sd[p10] * fx1 * fy0 + sd[p01] * fx0 * fy1 + sd[p11] * fx1 * fy1;
          d2[o + 1] = sd[p00 + 1] * fx0 * fy0 + sd[p10 + 1] * fx1 * fy0 + sd[p01 + 1] * fx0 * fy1 + sd[p11 + 1] * fx1 * fy1;
          d2[o + 2] = sd[p00 + 2] * fx0 * fy0 + sd[p10 + 2] * fx1 * fy0 + sd[p01 + 2] * fx0 * fy1 + sd[p11 + 2] * fx1 * fy1;
          d2[o + 3] = 255;
        }
      }
      rx.putImageData(o2, 0, 0);
      return rc2;
    };
    return { canvas: oc, w: OW, h: OH, corners, ratio: +ratio.toFixed(3), quality: { left: qz(left), right: qz(right), top: qz(top), bottom: qz(bottom) }, region };
  }

  // ---------- Carga de imágenes con CORS para calcular huellas ----------
  function loadImage(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeoutMs || 20000);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); reject(new Error('error de carga')); };
      img.src = url;
    });
  }
  async function loadFirst(urls) {
    let lastErr;
    for (const u of urls) { try { return await loadImage(u); } catch (e) { lastErr = e; } }
    throw lastErr || new Error('sin imagen');
  }

  /**
   * Calcula huellas de una lista de cartas. items: [{id, urls:[...]}]
   * onProgress(done, total). Devuelve [{id, sig}] (omite las que no se pudieron cargar).
   */
  async function computeSignatures(items, onProgress, concurrency, shouldStop) {
    const out = []; let done = 0, i = 0;
    const workers = [];
    const run = async () => {
      while (i < items.length) {
        if (shouldStop && shouldStop()) return;
        const it = items[i++];
        try {
          const img = await loadFirst(it.urls);
          const sig = signature(img, 0, 0, img.naturalWidth, img.naturalHeight);
          out.push({ id: it.id, sig });
        } catch (e) { /* imagen no disponible */ }
        done++; onProgress && onProgress(done, items.length);
      }
    };
    for (let k = 0; k < (concurrency || 4); k++) workers.push(run());
    await Promise.all(workers);
    return out;
  }

  // ---------- OCR del número impreso ----------
  const OCR = {
    worker: null, loading: null, failed: false, supported: null,
    isSupported() {
      if (this.supported !== null) return this.supported;
      // Necesita http(s): con file:// los workers y la descarga del modelo no funcionan.
      this.supported = /^https?:$/.test(location.protocol) && typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
      return this.supported;
    },
    async ensure(onStatus) {
      if (this.worker) return this.worker;
      if (this.failed) throw new Error('OCR no disponible');
      if (this.loading) return this.loading;
      this.loading = (async () => {
        if (!this.isSupported()) throw new Error('OCR requiere abrir la app por http/https');
        if (!window.Tesseract) {
          await new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = new URL((window.VISION_LIB_BASE || 'lib/tesseract/') + 'tesseract.min.js', location.href).href;
            s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar tesseract.min.js')); document.head.appendChild(s);
          });
        }
        const worker = await this.createWorker(onStatus);
        this.worker = worker; this.workers = [worker];
        // segundo trabajador en segundo plano (teléfonos con 4+ núcleos): las lecturas van en paralelo
        if ((navigator.hardwareConcurrency || 2) >= 4) setTimeout(() => this.ensureWorkers(2).catch(() => {}), 500);
        return worker;
      })();
      try { return await this.loading; }
      catch (e) { this.failed = true; this.loading = null; throw e; }
    },
    async createWorker(onStatus) {
      const base = new URL(window.VISION_LIB_BASE || 'lib/tesseract/', location.href).href;
      const worker = await Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        logger: m => { if (onStatus && m && m.status) onStatus(m); }
      });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: '11',
        preserve_interword_spaces: '1'
      });
      return worker;
    },
    // Hasta n trabajadores en paralelo (en móviles con varios núcleos las pasadas van de dos en dos).
    async ensureWorkers(n, onStatus, wait) {
      await this.ensure(onStatus);
      if (!this.workers) this.workers = [this.worker];
      if (n > 1 && this.workers.length < n && !this.secondFailed) {
        if (!this.loading2) this.loading2 = this.createWorker().then(w => { this.workers.push(w); }).catch(() => { this.secondFailed = true; });
        if (wait !== false) await this.loading2;   // si no se espera, se usa lo que haya listo
      }
      return this.workers.slice(0, n);
    },
    // Quita de la máscara de texto los recuadros macizos (cajas del código de colección, de regulación,
    // símbolos) que van pegados al número: Tesseract los fusiona con los dígitos y se come la barra.
    // Un dígito tiene huecos y trazos; una caja rellena tiene casi todas sus filas cubiertas de tinta.
    removeBoxes(bin, cw, ch, h) {
      const label = new Int32Array(cw * ch); const stack = new Int32Array(cw * ch); let n = 0;
      const minH = h * 0.15, minW = h * 0.12;
      for (let start = 0; start < cw * ch; start++) {
        if (!bin[start] || label[start]) continue;
        const id = ++n; let sp = 0; stack[sp++] = start; label[start] = id;
        let x0 = cw, x1 = 0, y0 = ch, y1 = 0; const pix = [];
        while (sp > 0) {
          const j = stack[--sp]; pix.push(j);
          const yy = (j / cw) | 0, xx = j - yy * cw;
          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          if (xx > 0 && bin[j - 1] && !label[j - 1]) { label[j - 1] = id; stack[sp++] = j - 1; }
          if (xx < cw - 1 && bin[j + 1] && !label[j + 1]) { label[j + 1] = id; stack[sp++] = j + 1; }
          if (yy > 0 && bin[j - cw] && !label[j - cw]) { label[j - cw] = id; stack[sp++] = j - cw; }
          if (yy < ch - 1 && bin[j + cw] && !label[j + cw]) { label[j + cw] = id; stack[sp++] = j + cw; }
        }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (bh < minH || bw < minW) continue;
        // filas del recuadro con mucha tinta (≥60% del ancho) y extensión casi completa
        const cnt = new Int32Array(bh), lo = new Int32Array(bh).fill(cw), hi = new Int32Array(bh);
        for (const j of pix) { const yy = ((j / cw) | 0) - y0, xx = (j % cw); cnt[yy]++; if (xx < lo[yy]) lo[yy] = xx; if (xx > hi[yy]) hi[yy] = xx; }
        let full = 0; for (let r = 0; r < bh; r++) if (cnt[r] >= bw * 0.6 && (hi[r] - lo[r] + 1) >= bw * 0.8) full++;
        const fill = pix.length / (bw * bh);
        if (full >= bh * 0.5 && fill >= 0.55) for (const j of pix) bin[j] = 0;
      }
    },
    // Prepara la franja inferior de la carta (donde va el número): alta resolución + umbral adaptativo
    // (método de Bradley) para que bordes, fondos y luz desigual no confundan al OCR.
    prepareStrip(source, sx, sy, sw, sh, mode, yFrom, yTo, xFrom, xTo, slot) {
      // mode: 'adaptive' (texto oscuro sobre claro), 'adaptive-inv' (claro sobre oscuro),
      //       'bright' (solo los píxeles más claros: texto blanco con borde oscuro, típico de cartas modernas),
      //       'dark' (solo los píxeles más oscuros). true/false se aceptan por compatibilidad.
      if (mode === true) mode = 'adaptive-inv'; if (!mode) mode = 'adaptive';
      const invert = mode === 'adaptive-inv';
      yFrom = yFrom == null ? 0.86 : yFrom; yTo = yTo == null ? 0.985 : yTo;
      xFrom = xFrom == null ? 0 : xFrom; xTo = xTo == null ? 1 : xTo;
      const FRAC = yTo - yFrom, XF = xTo - xFrom, W = 1000, PAD = 28;
      const h = Math.max(40, Math.round(W * (sh * FRAC) / (sw * XF)));
      const cw = W + PAD * 2, ch = h + PAD * 2;
      const c = cv('ocr' + (slot || ''), cw, ch);
      const x = ctx2d(c);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.fillStyle = (invert || mode === 'bright' || mode === 'bright-halo' || mode === 'gray-inv') ? '#000' : (mode === 'dark-halo' || mode === 'local' || mode === 'local-inv' || mode === 'closed-bright' || mode === 'closed-dark' || mode === 'outline' || mode === 'outline-inv' || mode === 'soft' || mode === 'soft-inv' || mode === 'thin' || mode === 'thin-inv' ? '#808080' : '#fff'); x.fillRect(0, 0, cw, ch);
      // Si la vía rápida midió una inclinación del texto (carta mal enderezada), se corrige con una cizalla
      const skew = this.lastSkew || 0;
      if (Math.abs(skew) > 0.005) {
        x.save(); x.translate(PAD + W / 2, PAD + h / 2); x.transform(1, -Math.tan(skew), 0, 1, 0, 0); x.translate(-(PAD + W / 2), -(PAD + h / 2));
        x.drawImage(source, sx + sw * xFrom, sy + sh * yFrom, sw * XF, sh * FRAC, PAD, PAD, W, h);
        x.restore();
      } else x.drawImage(source, sx + sw * xFrom, sy + sh * yFrom, sw * XF, sh * FRAC, PAD, PAD, W, h);
      const im = x.getImageData(0, 0, cw, ch), d = im.data;
      const g0 = new Float32Array(cw * ch);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { let v = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8; if (invert) v = 255 - v; g0[j] = v; }
      // filtro de mediana 3x3 (quita ruido de la foto)
      const g = new Float32Array(cw * ch); const win = new Float32Array(9);
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        if (yy === 0 || xx === 0 || yy === ch - 1 || xx === cw - 1) { g[yy * cw + xx] = g0[yy * cw + xx]; continue; }
        let k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) win[k++] = g0[(yy + dy) * cw + xx + dx];
        win.sort(); g[yy * cw + xx] = win[4];
      }
      if (mode === 'gray' || mode === 'gray-inv') {
        // Escala de grises "limpia" (sin binarizar): el fondo (mediana) se lleva a blanco y el texto a negro
        // con un estirado de contraste; Tesseract umbraliza mejor los trazos gruesos suavizados que las
        // máscaras dentadas. 'gray-inv' para texto claro sobre fondo oscuro.
        const inv3 = mode === 'gray-inv';
        const hist = new Int32Array(256); let total = 0;
        for (let yy = PAD; yy < PAD + h; yy++) for (let xx = PAD; xx < PAD + W; xx++) { const v = inv3 ? 255 - g[yy * cw + xx] : g[yy * cw + xx]; hist[Math.max(0, Math.min(255, v | 0))]++; total++; }
        let acc = 0; const pct = {};
        for (let v = 0; v < 256; v++) { acc += hist[v]; for (const q of [4, 55]) if (pct[q] === undefined && acc >= total * q / 100) pct[q] = v; }
        const lo = pct[4], hi = Math.max(lo + 30, pct[55]);
        for (let j = 0, i = 0; j < g.length; j++, i += 4) {
          const v = inv3 ? 255 - g[j] : g[j];
          const o = Math.max(0, Math.min(255, Math.round((v - lo) / (hi - lo) * 255)));
          d[i] = d[i + 1] = d[i + 2] = o; d[i + 3] = 255;
        }
        x.putImageData(im, 0, 0);
        return c;
      }
      if (mode === 'outline-inv') { for (let j = 0; j < g.length; j++) g[j] = 255 - g[j]; mode = 'outline'; }
      if (mode === 'outline') {
        // Texto con contorno (dígitos con halo claro, típico de cartas modernas), robusto aunque la tinta y el
        // fondo tengan el mismo brillo: se detecta el halo (píxeles localmente claros) y se rellenan las regiones
        // encerradas por el anillo exterior de cada glifo (el trazo), dejando vacíos los contadores interiores.
        const RL = Math.max(8, Math.round(h * 0.16));
        const L1 = new Float64Array((cw + 1) * (ch + 1)), L2 = new Float64Array((cw + 1) * (ch + 1));
        for (let yy = 1; yy <= ch; yy++) { let r1 = 0, r2 = 0; for (let xx = 1; xx <= cw; xx++) { const v = g[(yy - 1) * cw + (xx - 1)]; r1 += v; r2 += v * v; L1[yy * (cw + 1) + xx] = L1[(yy - 1) * (cw + 1) + xx] + r1; L2[yy * (cw + 1) + xx] = L2[(yy - 1) * (cw + 1) + xx] + r2; } }
        const boxSum = (A, x0, y0, x1, y1) => A[(y1 + 1) * (cw + 1) + (x1 + 1)] - A[y0 * (cw + 1) + (x1 + 1)] - A[(y1 + 1) * (cw + 1) + x0] + A[y0 * (cw + 1) + x0];
        const H = new Uint8Array(cw * ch);
        for (let yy = 0; yy < ch; yy++) {
          const y0 = Math.max(0, yy - RL), y1 = Math.min(ch - 1, yy + RL);
          for (let xx = 0; xx < cw; xx++) {
            const x0 = Math.max(0, xx - RL), x1 = Math.min(cw - 1, xx + RL);
            const n = (x1 - x0 + 1) * (y1 - y0 + 1);
            const mu = boxSum(L1, x0, y0, x1, y1) / n, sd = Math.sqrt(Math.max(0, boxSum(L2, x0, y0, x1, y1) / n - mu * mu));
            H[yy * cw + xx] = (sd >= 14 && g[yy * cw + xx] > mu + 0.55 * sd) ? 1 : 0;
          }
        }
        // etiquetado de componentes (4-conectividad) de halo (H) y no-halo (N)
        const label = new Int32Array(cw * ch); let nLabels = 0;
        const stack = new Int32Array(cw * ch);
        const areas = [], isHalo = [], touchesBorder = [];
        for (let start = 0; start < cw * ch; start++) {
          if (label[start]) continue;
          const kind = H[start]; const id = ++nLabels; let sp = 0, area = 0, border = false;
          stack[sp++] = start; label[start] = id;
          while (sp > 0) {
            const j = stack[--sp]; area++;
            const yy = (j / cw) | 0, xx = j - yy * cw;
            if (xx === 0 || yy === 0 || xx === cw - 1 || yy === ch - 1) border = true;
            if (xx > 0 && !label[j - 1] && H[j - 1] === kind) { label[j - 1] = id; stack[sp++] = j - 1; }
            if (xx < cw - 1 && !label[j + 1] && H[j + 1] === kind) { label[j + 1] = id; stack[sp++] = j + 1; }
            if (yy > 0 && !label[j - cw] && H[j - cw] === kind) { label[j - cw] = id; stack[sp++] = j - cw; }
            if (yy < ch - 1 && !label[j + cw] && H[j + cw] === kind) { label[j + cw] = id; stack[sp++] = j + cw; }
          }
          areas[id] = area; isHalo[id] = kind; touchesBorder[id] = border;
        }
        // componentes de halo adyacentes al fondo exterior (no-halo que toca el borde) = anillos exteriores
        const outerRing = new Uint8Array(nLabels + 1);
        for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
          const j = yy * cw + xx; if (!H[j]) continue;
          const nb = [j - 1, j + 1, j - cw, j + cw];
          for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (!H[k] && touchesBorder[label[k]]) { outerRing[label[j]] = 1; break; } }
        }
        // regiones no-halo encerradas y adyacentes a un anillo exterior = trazos
        const isText = new Uint8Array(nLabels + 1);
        const maxArea = Math.pow(h * 0.9, 2), minArea = 10;
        for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
          const j = yy * cw + xx; if (H[j]) continue;
          const id = label[j]; if (touchesBorder[id] || areas[id] > maxArea || areas[id] < minArea || isText[id]) continue;
          const nb = [j - 1, j + 1, j - cw, j + cw];
          for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (H[k] && outerRing[label[k]]) { isText[id] = 1; break; } }
        }
        // engrosa 1 px los trazos (Tesseract lee mejor los trazos no tan finos)
        const T0 = new Uint8Array(cw * ch);
        for (let j = 0; j < cw * ch; j++) T0[j] = (!H[j] && isText[label[j]]) ? 1 : 0;
        for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
          const j = yy * cw + xx;
          let v = T0[j];
          if (!v) { if ((xx > 0 && T0[j - 1]) || (xx < cw - 1 && T0[j + 1]) || (yy > 0 && T0[j - cw]) || (yy < ch - 1 && T0[j + cw])) v = 1; }
          const o = j * 4; const col = v ? 0 : 255; d[o] = d[o + 1] = d[o + 2] = col; d[o + 3] = 255;
        }
        x.putImageData(im, 0, 0);
        return c;
      }
      if (mode === 'closed-bright' || mode === 'closed-dark') {
        // Texto con contorno: el halo claro (u oscuro) dibuja el contorno de cada glifo. Se toma el halo y se
        // "cierra" morfológicamente (dilatar + erosionar) para rellenar el trazo y obtener glifos sólidos.
        const brightSide = mode === 'closed-bright';
        const hist = new Int32Array(256); let total = 0;
        for (let yy = PAD; yy < PAD + h; yy++) for (let xx = PAD; xx < PAD + W; xx++) { hist[Math.max(0, Math.min(255, g[yy * cw + xx] | 0))]++; total++; }
        let acc = 0; const pct = {};
        for (let v = 0; v < 256; v++) { acc += hist[v]; for (const q of [25, 50, 75]) if (pct[q] === undefined && acc >= total * q / 100) pct[q] = v; }
        const thr = brightSide ? Math.max(pct[50] + 20, pct[75]) : Math.min(pct[50] - 20, pct[25]);
        let m = new Uint8Array(cw * ch);
        for (let j = 0; j < g.length; j++) m[j] = brightSide ? (g[j] >= thr ? 1 : 0) : (g[j] <= thr ? 1 : 0);
        const r = Math.max(2, Math.round(h * 0.022));
        const filt = (src, isMax) => {
          const tmp = new Uint8Array(cw * ch), out = new Uint8Array(cw * ch);
          for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
            let v = isMax ? 0 : 1;
            for (let k = -r; k <= r; k++) { const x2 = xx + k; if (x2 < 0 || x2 >= cw) { if (!isMax) v = 0; continue; } const q = src[yy * cw + x2]; if (isMax ? q > v : q < v) v = q; }
            tmp[yy * cw + xx] = v;
          }
          for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
            let v = isMax ? 0 : 1;
            for (let k = -r; k <= r; k++) { const y2 = yy + k; if (y2 < 0 || y2 >= ch) { if (!isMax) v = 0; continue; } const q = tmp[y2 * cw + xx]; if (isMax ? q > v : q < v) v = q; }
            out[yy * cw + xx] = v;
          }
          return out;
        };
        m = filt(filt(m, true), false);
        for (let yy = 0; yy < ch; yy++) { let cnt = 0; for (let xx = 0; xx < cw; xx++) cnt += m[yy * cw + xx]; if (cnt > cw * 0.5) for (let xx = 0; xx < cw; xx++) m[yy * cw + xx] = 0; }
        for (let xx = 0; xx < cw; xx++) { let cnt = 0; for (let yy = 0; yy < ch; yy++) cnt += m[yy * cw + xx]; if (cnt > ch * 0.6) for (let yy = 0; yy < ch; yy++) m[yy * cw + xx] = 0; }
        for (let j = 0, i = 0; j < m.length; j++, i += 4) { const v = m[j] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        x.putImageData(im, 0, 0);
        return c;
      }
      const soft = mode === 'soft' || mode === 'soft-inv';
      if (soft) mode = mode === 'soft' ? 'local' : 'local-inv';
      // 'thin'/'thin-inv': solo el núcleo de los trazos (umbral local más exigente sobre la imagen suavizada):
      // adelgaza tipografías gruesas o en cursiva, en las que los glifos se pegan entre sí.
      const thin = mode === 'thin' || mode === 'thin-inv';
      let kLocal = 0.6;
      if (thin) {
        mode = mode === 'thin' ? 'local' : 'local-inv'; kLocal = 1.15;
        const gs = new Float32Array(cw * ch);
        for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
          if (yy === 0 || xx === 0 || yy === ch - 1 || xx === cw - 1) { gs[yy * cw + xx] = g[yy * cw + xx]; continue; }
          let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += g[(yy + dy) * cw + xx + dx];
          gs[yy * cw + xx] = sum / 9;
        }
        g.set(gs);
      }
      if (mode === 'local' || mode === 'local-inv') {
        // Umbral local tipo Niblack con imagen integral: texto = píxeles bastante más oscuros (o claros)
        // que la media de su entorno, solo donde hay contraste (σ alta). Funciona con texto liso y con
        // texto con contorno (dígitos oscuros con halo claro sobre fondo oscuro, típico de cartas modernas).
        // Variante 'soft': la máscara solo delimita la zona y dentro se deja el gris original (bordes suaves),
        // que Tesseract lee mejor en tipografías gruesas o en cursiva.
        const inv2 = mode === 'local-inv';
        const R = Math.max(10, Math.round(h * 0.16));
        const I1 = new Float64Array((cw + 1) * (ch + 1)), I2 = new Float64Array((cw + 1) * (ch + 1));
        for (let yy = 1; yy <= ch; yy++) { let r1 = 0, r2 = 0; for (let xx = 1; xx <= cw; xx++) { const v = g[(yy - 1) * cw + (xx - 1)]; r1 += v; r2 += v * v; I1[yy * (cw + 1) + xx] = I1[(yy - 1) * (cw + 1) + xx] + r1; I2[yy * (cw + 1) + xx] = I2[(yy - 1) * (cw + 1) + xx] + r2; } }
        const bin2 = new Uint8Array(cw * ch);
        for (let yy = 0; yy < ch; yy++) {
          const y0 = Math.max(0, yy - R), y1 = Math.min(ch - 1, yy + R);
          for (let xx = 0; xx < cw; xx++) {
            const x0 = Math.max(0, xx - R), x1 = Math.min(cw - 1, xx + R);
            const n = (x1 - x0 + 1) * (y1 - y0 + 1);
            const s1 = I1[(y1 + 1) * (cw + 1) + (x1 + 1)] - I1[y0 * (cw + 1) + (x1 + 1)] - I1[(y1 + 1) * (cw + 1) + x0] + I1[y0 * (cw + 1) + x0];
            const s2 = I2[(y1 + 1) * (cw + 1) + (x1 + 1)] - I2[y0 * (cw + 1) + (x1 + 1)] - I2[(y1 + 1) * (cw + 1) + x0] + I2[y0 * (cw + 1) + x0];
            const mu = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - mu * mu));
            const v = g[yy * cw + xx];
            let t = 0;
            if (sd >= 18) t = inv2 ? (v > mu + kLocal * sd ? 1 : 0) : (v < mu - kLocal * sd ? 1 : 0);
            bin2[yy * cw + xx] = t;
          }
        }
        for (let yy = 0; yy < ch; yy++) { let cnt = 0; for (let xx = 0; xx < cw; xx++) cnt += bin2[yy * cw + xx]; if (cnt > cw * 0.5) for (let xx = 0; xx < cw; xx++) bin2[yy * cw + xx] = 0; }
        for (let xx = 0; xx < cw; xx++) { let cnt = 0; for (let yy = 0; yy < ch; yy++) cnt += bin2[yy * cw + xx]; if (cnt > ch * 0.6) for (let yy = 0; yy < ch; yy++) bin2[yy * cw + xx] = 0; }
        if (soft) {
          // dilata la máscara 2 px y deja dentro el gris (invertido si el texto es claro), estirado para que
          // el trazo quede negro y el borde suave; fuera, blanco.
          const dil = new Uint8Array(cw * ch);
          for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
            let v = 0;
            for (let dy = -2; dy <= 2 && !v; dy++) { const y2 = yy + dy; if (y2 < 0 || y2 >= ch) continue; for (let dx = -2; dx <= 2; dx++) { const x2 = xx + dx; if (x2 >= 0 && x2 < cw && bin2[y2 * cw + x2]) { v = 1; break; } } }
            dil[yy * cw + xx] = v;
          }
          // niveles de referencia dentro de la máscara: mediana del trazo (→ negro) y del borde dilatado (→ blanco)
          let sIn = 0, nIn = 0, sOut = 0, nOut = 0;
          for (let j = 0; j < cw * ch; j++) { const v = inv2 ? 255 - g[j] : g[j]; if (bin2[j]) { sIn += v; nIn++; } else if (dil[j]) { sOut += v; nOut++; } }
          const vIn = nIn ? sIn / nIn : 0, vOut = nOut ? sOut / nOut : 255;
          const lo = vIn, hi = Math.max(lo + 40, vOut);
          for (let j = 0, i = 0; j < cw * ch; j++, i += 4) {
            let o = 255;
            if (dil[j]) { const v = inv2 ? 255 - g[j] : g[j]; o = Math.max(0, Math.min(255, Math.round((v - lo) / (hi - lo) * 255))); }
            d[i] = d[i + 1] = d[i + 2] = o; d[i + 3] = 255;
          }
          x.putImageData(im, 0, 0);
          return c;
        }
        for (let j = 0, i = 0; j < bin2.length; j++, i += 4) { const v = bin2[j] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        x.putImageData(im, 0, 0);
        return c;
      }
      if (mode === 'bright' || mode === 'dark' || mode === 'dark-halo' || mode === 'bright-halo') {
        // umbrales globales por percentiles (solo de la zona dibujada, sin los márgenes)
        const hist = new Int32Array(256); let total = 0;
        for (let yy = PAD; yy < PAD + h; yy++) for (let xx = PAD; xx < PAD + W; xx++) { hist[Math.max(0, Math.min(255, g[yy * cw + xx] | 0))]++; total++; }
        let acc = 0; const pct = {};
        for (let v = 0; v < 256; v++) { acc += hist[v]; for (const q of [10, 20, 50, 80, 88]) if (pct[q] === undefined && acc >= total * q / 100) pct[q] = v; }
        const pMed = pct[50];
        const bin2 = new Uint8Array(cw * ch);
        if (mode === 'bright' || mode === 'dark') {
          // texto blanco (o negro) liso: lo más claro (u oscuro) de la franja
          const thr = mode === 'bright' ? Math.max(pMed + 25, pct[88]) : Math.min(pMed - 25, pct[10]);
          for (let j = 0; j < g.length; j++) bin2[j] = mode === 'bright' ? (g[j] >= thr ? 1 : 0) : (g[j] <= thr ? 1 : 0);
        } else {
          // texto con contorno (típico de cartas modernas: dígitos oscuros con halo claro, o al revés):
          // se queda con los píxeles oscuros (claros) que están a pocos píxeles de un píxel claro (oscuro).
          const darkThr = Math.min(pMed - 12, pct[20]), brightThr = Math.max(pMed + 12, pct[80]);
          const coreDark = mode === 'dark-halo';
          const halo = new Uint8Array(cw * ch);
          for (let j = 0; j < g.length; j++) halo[j] = coreDark ? (g[j] >= brightThr ? 1 : 0) : (g[j] <= darkThr ? 1 : 0);
          // dilatación del halo con imagen integral (radio ≈ 1/4 de la altura del texto)
          const R = Math.max(4, Math.round(h * 0.075));
          const I = new Int32Array((cw + 1) * (ch + 1));
          for (let yy = 1; yy <= ch; yy++) { let row = 0; for (let xx = 1; xx <= cw; xx++) { row += halo[(yy - 1) * cw + (xx - 1)]; I[yy * (cw + 1) + xx] = I[(yy - 1) * (cw + 1) + xx] + row; } }
          // media y desviación locales (ventana ≈ altura del texto) para que el fondo cercano no cuente como trazo
          const RL = Math.max(8, Math.round(h * 0.13));
          const L1 = new Float64Array((cw + 1) * (ch + 1)), L2 = new Float64Array((cw + 1) * (ch + 1));
          for (let yy = 1; yy <= ch; yy++) { let r1 = 0, r2 = 0; for (let xx = 1; xx <= cw; xx++) { const v = g[(yy - 1) * cw + (xx - 1)]; r1 += v; r2 += v * v; L1[yy * (cw + 1) + xx] = L1[(yy - 1) * (cw + 1) + xx] + r1; L2[yy * (cw + 1) + xx] = L2[(yy - 1) * (cw + 1) + xx] + r2; } }
          const boxSum = (A, x0, y0, x1, y1) => A[(y1 + 1) * (cw + 1) + (x1 + 1)] - A[y0 * (cw + 1) + (x1 + 1)] - A[(y1 + 1) * (cw + 1) + x0] + A[y0 * (cw + 1) + x0];
          for (let yy = 0; yy < ch; yy++) {
            const y0 = Math.max(0, yy - R), y1 = Math.min(ch - 1, yy + R);
            const ly0 = Math.max(0, yy - RL), ly1 = Math.min(ch - 1, yy + RL);
            for (let xx = 0; xx < cw; xx++) {
              const j = yy * cw + xx;
              const v = g[j];
              const coreGlobal = coreDark ? (v <= darkThr) : (v >= brightThr);
              if (!coreGlobal) { bin2[j] = 0; continue; }
              const lx0 = Math.max(0, xx - RL), lx1 = Math.min(cw - 1, xx + RL);
              const n = (lx1 - lx0 + 1) * (ly1 - ly0 + 1);
              const mu = boxSum(L1, lx0, ly0, lx1, ly1) / n, sd = Math.sqrt(Math.max(0, boxSum(L2, lx0, ly0, lx1, ly1) / n - mu * mu));
              const coreLocal = sd >= 12 && (coreDark ? v < mu - 0.45 * sd : v > mu + 0.45 * sd);
              if (!coreLocal) { bin2[j] = 0; continue; }
              const x0 = Math.max(0, xx - R), x1 = Math.min(cw - 1, xx + R);
              bin2[j] = boxSum(I, x0, y0, x1, y1) > 0 ? 1 : 0;
            }
          }
          // limpieza: mayoría 3x3 para quitar motas
          const tmp = new Uint8Array(bin2);
          for (let yy = 1; yy < ch - 1; yy++) for (let xx = 1; xx < cw - 1; xx++) {
            let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += tmp[(yy + dy) * cw + xx + dx];
            bin2[yy * cw + xx] = n >= 5 ? 1 : (n <= 2 ? 0 : tmp[yy * cw + xx]);
          }
        }
        // limpia bordes (líneas largas) igual que abajo
        for (let yy = 0; yy < ch; yy++) { let cnt = 0; for (let xx = 0; xx < cw; xx++) cnt += bin2[yy * cw + xx]; if (cnt > cw * 0.5) for (let xx = 0; xx < cw; xx++) bin2[yy * cw + xx] = 0; }
        for (let xx = 0; xx < cw; xx++) { let cnt = 0; for (let yy = 0; yy < ch; yy++) cnt += bin2[yy * cw + xx]; if (cnt > ch * 0.6) for (let yy = 0; yy < ch; yy++) bin2[yy * cw + xx] = 0; }
        for (let j = 0, i = 0; j < bin2.length; j++, i += 4) { const v = bin2[j] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        x.putImageData(im, 0, 0);
        return c;
      }
      // umbral adaptativo (Bradley) con imagen integral
      const I = new Float64Array((cw + 1) * (ch + 1));
      for (let yy = 1; yy <= ch; yy++) { let row = 0; for (let xx = 1; xx <= cw; xx++) { row += g[(yy - 1) * cw + (xx - 1)]; I[yy * (cw + 1) + xx] = I[(yy - 1) * (cw + 1) + xx] + row; } }
      const S = 45, T = 0.18, hs = S >> 1;
      const bin = new Uint8Array(cw * ch);
      const rowBlack = new Int32Array(ch), colBlack = new Int32Array(cw);
      for (let yy = 0; yy < ch; yy++) {
        const y0 = Math.max(0, yy - hs), y1 = Math.min(ch - 1, yy + hs);
        for (let xx = 0; xx < cw; xx++) {
          const x0 = Math.max(0, xx - hs), x1 = Math.min(cw - 1, xx + hs);
          const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
          const sum = I[(y1 + 1) * (cw + 1) + (x1 + 1)] - I[y0 * (cw + 1) + (x1 + 1)] - I[(y1 + 1) * (cw + 1) + x0] + I[y0 * (cw + 1) + x0];
          const b = g[yy * cw + xx] * cnt < sum * (1 - T) ? 1 : 0;
          bin[yy * cw + xx] = b; rowBlack[yy] += b; colBlack[xx] += b;
        }
      }
      // elimina líneas largas (bordes de la carta, aunque estén algo inclinados) que se pegan al texto:
      // proyecta los píxeles negros sobre filas/columnas "cizalladas" en varios ángulos y borra las que
      // concentran una fracción grande del ancho/alto.
      const blacks = [];
      for (let j = 0; j < bin.length; j++) if (bin[j]) blacks.push(j);
      const off = cw + ch;
      const project = (t, vertical) => {
        const hist = new Int32Array((cw + ch) * 2 + 4);
        for (const j of blacks) { const yy = (j / cw) | 0, xx = j - yy * cw; hist[(vertical ? Math.round(xx - yy * t) : Math.round(yy - xx * t)) + off]++; }
        let peak = 0; for (let i = 0; i < hist.length; i++) if (hist[i] > peak) peak = hist[i];
        return { hist, peak };
      };
      for (const vertical of [false, true]) {
        // busca el ángulo en el que la línea del borde se concentra más
        let best = null;
        for (let a = -0.07; a <= 0.071; a += 0.005) {
          const t = Math.tan(a); const p = project(t, vertical);
          if (!best || p.peak > best.peak) best = { t, ...p };
        }
        const limit = vertical ? ch * 0.5 : cw * 0.22;
        if (best && best.peak > limit) {
          for (const j of blacks) {
            const yy = (j / cw) | 0, xx = j - yy * cw;
            const k = (vertical ? Math.round(xx - yy * best.t) : Math.round(yy - xx * best.t)) + off;
            if (best.hist[k] > limit) bin[j] = 0;
          }
        }
      }
      void rowBlack; void colBlack;
      for (let j = 0, i = 0; j < bin.length; j++, i += 4) { const v = bin[j] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      return c;
    },
    parse(text, data, lenient) {
      const clean = (s) => s.toUpperCase().replace(/[|\\]/g, '/').replace(/\s+/g, ' ');
      const known = this.knownTotals;
      const plausible = (num, total) => {
        const nd = parseInt(num.replace(/\D/g, ''), 10), td = parseInt(total.replace(/\D/g, ''), 10);
        if (!(td >= 10) || !(nd >= 1)) return false;
        if (nd > td + 120) return false;                      // 500/10 no existe
        if (known && known.size && /^\d+$/.test(total) && !known.has(td)) return false; // el total debe ser el de alguna colección
        return true;
      };
      // confianza de la palabra que contiene el número (si el OCR la reporta)
      const confOf = (num, total) => {
        if (!data || !data.words || !data.words.length) return 100;
        // algunas versiones no reportan confianzas (todas 0): en ese caso no se puede filtrar por confianza
        if (!data.words.some(w => (w.confidence || 0) > 0)) return 100;
        let best = 0;
        for (const w of data.words) { const tw = clean(w.text || ''); if (tw.includes(num) || tw.includes(total)) best = Math.max(best, w.confidence || 0); }
        return best;
      };
      // prefijo de letras solo si es un prefijo real de numeración (TG, GG, SV, SWSH…); si no, se descarta
      const fixPrefix = (n) => {
        const m = /^([A-Z]*)(\d{1,3})$/.exec(n); if (!m || !m[1]) return n;
        return (this.knownPrefixes && this.knownPrefixes.has(m[1])) ? n : m[2];
      };
      const tryMatch = (t, minConf) => {
        const re = /([A-Z]{0,4}\d{1,3})\s*\/\s*([A-Z]{0,4}\d{1,3})/g;
        const found = []; let m;
        while ((m = re.exec(t))) found.push({ num: m[1], total: m[2] });
        const ok = found.filter(f => plausible(f.num, f.total));
        if (!ok.length) return null;
        ok.sort((a, b) => (b.total.replace(/\D/g, '').length - a.total.replace(/\D/g, '').length));
        const f = ok[0];
        const conf = confOf(f.num, f.total);
        if (conf < minConf) return null;
        return { num: fixPrefix(f.num), total: fixPrefix(f.total), raw: t.trim(), conf };
      };
      const t = clean(text || '');
      // 1) tal cual; 2) corrigiendo confusiones típicas del OCR (O→0, I/L→1, Z→2, Q→0)
      const r = tryMatch(t, 45) || tryMatch(t.replace(/[OQ]/g, '0').replace(/[IL]/g, '1').replace(/Z/g, '2'), 60);
      if (r) return r;
      // 3) la barra se leyó como dígito ("0059165"): prueba particiones cuyo total sea un total conocido
      //    (solo si el OCR está bastante seguro de esa palabra)
      if (this.knownTotals && this.knownTotals.size) {
        const runs = t.replace(/[OQ]/g, '0').replace(/[IL]/g, '1').match(/\d{5,7}/g) || [];
        for (const run of runs) {
          for (const tl of [3, 2]) {
            if (run.length <= tl + 1) continue;
            const total = run.slice(-tl); let num = run.slice(0, -tl);
            if (num.length > 3) { if (num.length > 4 || !/[1479]$/.test(num)) continue; num = num.slice(0, -1); }
            if (!plausible(num, total)) continue;
            if (!lenient && confOf(run, run) < 75) continue;
            return { num, total, raw: t.trim(), guessed: true };
          }
        }
      }
      return null;
    },
    knownTotals: null,
    knownPrefixes: null,
    knownSetCodes: null,   // abreviaturas oficiales de colección (SVI, PRE, MEG…) para validar el código impreso
    LANG_CODES: ['EN', 'ES', 'FR', 'DE', 'IT', 'PT', 'JP', 'KO', 'ZH', 'TH', 'ID', 'RU'],
    // "PRE ES" / "PREES" / "SVI EN" → {set:'PRE', lang:'ES'}; null si no se reconoce
    parseSetCode(text) {
      const t = String(text || '').toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return null;
      const parts = t.split(' ').filter(Boolean);
      const codes = this.knownSetCodes;
      const isCode = (s) => s.length >= 2 && s.length <= 5 && (!codes || !codes.size || codes.has(s));
      // dos palabras: "PRE ES"
      for (let i = 0; i + 1 < parts.length; i++) if (this.LANG_CODES.includes(parts[i + 1]) && isCode(parts[i])) return { set: parts[i], lang: parts[i + 1], raw: t };
      // pegado: "PREES", "SVIEN"
      for (const p of parts) { const l = p.slice(-2), s = p.slice(0, -2); if (p.length >= 4 && this.LANG_CODES.includes(l) && isCode(s)) return { set: s, lang: l, raw: t }; }
      // solo el código de colección (sin idioma legible)
      for (const p of parts) if (codes && codes.size && codes.has(p)) return { set: p, lang: '', raw: t };
      return null;
    },
    /**
     * Lee el número impreso. Prueba varias franjas (por si la guía quedó desplazada), la mitad izquierda
     * (cartas modernas) y la derecha (cartas antiguas), y texto oscuro/claro. diag (opcional) recoge
     * el texto crudo de cada pasada para el panel de diagnóstico.
     */
    // Brillo mediano de la zona del número (esquina inferior izquierda): decide qué modos probar primero.
    numberAreaBrightness(source, sx, sy, sw, sh) {
      const c = cv('ocr-probe', 60, 12), x = ctx2d(c);
      x.drawImage(source, sx, sy + sh * 0.88, sw * 0.5, sh * 0.09, 0, 0, 60, 12);
      const d = x.getImageData(0, 0, 60, 12).data, vals = [];
      for (let i = 0; i < d.length; i += 4) vals.push((d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8);
      vals.sort((a, b) => a - b);
      return vals[vals.length >> 1];
    },
    /**
     * Lee el número impreso. Prueba varios modos de binarización (dígitos con halo, texto claro sobre oscuro,
     * texto oscuro sobre claro…) y franjas (por si la guía quedó desplazada), la mitad izquierda (cartas
     * modernas) y la derecha (cartas antiguas). Se detiene en cuanto una lectura es plausible o al agotar el
     * tiempo (opts.budgetMs). diag (opcional) recoge el texto crudo de cada pasada para el diagnóstico.
     */
    // ---------- Lectura rápida por "palabras" (vía principal) ----------
    // Dibuja una zona de la carta (fracciones u/v) ampliada `scale` veces. Si hay función `region`
    // (carta enderezada desde la foto original), la zona se remuestrea a resolución completa.
    zoneCanvas(source, sx, sy, sw, sh, zone, scale, region, slot) {
      const [u0, u1, v0, v1] = zone;
      const W = Math.round(sw * (u1 - u0) * scale), H = Math.round(sh * (v1 - v0) * scale);
      if (region) { try { const c = region(u0, v0, u1, v1, W, slot); if (c) return c; } catch (e) { /* recorte plano */ } }
      const c = cv('ocr-zone' + (slot || 0), W, H), x = ctx2d(c);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(source, sx + sw * u0, sy + sh * v0, sw * (u1 - u0), sh * (v1 - v0), 0, 0, W, H);
      return c;
    },
    // Binarización local de Sauvola: tinta = píxeles claramente más oscuros (o más claros, `light`) que
    // su entorno. Devuelve {bin, w, h} (bin: 1 = tinta).
    sauvola(canvas, light, k, r) {
      const w = canvas.width, h = canvas.height, d = ctx2d(canvas).getImageData(0, 0, w, h).data;
      const g = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8; g[j] = light ? 255 - v : v; }
      const W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1));
      for (let y = 1; y <= h; y++) {
        let rs = 0, rs2 = 0;
        for (let x = 1; x <= w; x++) { const v = g[(y - 1) * w + x - 1]; rs += v; rs2 += v * v; I[y * W1 + x] = I[(y - 1) * W1 + x] + rs; I2[y * W1 + x] = I2[(y - 1) * W1 + x] + rs2; }
      }
      const bin = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const ya = Math.max(0, y - r), yb = Math.min(h - 1, y + r);
        for (let x = 0; x < w; x++) {
          const xa = Math.max(0, x - r), xb = Math.min(w - 1, x + r), n = (xb - xa + 1) * (yb - ya + 1);
          const sm = I[(yb + 1) * W1 + xb + 1] - I[ya * W1 + xb + 1] - I[(yb + 1) * W1 + xa] + I[ya * W1 + xa];
          const s2 = I2[(yb + 1) * W1 + xb + 1] - I2[ya * W1 + xb + 1] - I2[(yb + 1) * W1 + xa] + I2[ya * W1 + xa];
          const m = sm / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
          const t = m * (1 + k * (sd / 128 - 1));
          bin[y * w + x] = (g[y * w + x] < t && sd > 6) ? 1 : 0;
        }
      }
      return { bin, w, h };
    },
    // Agrupa la tinta en "palabras" y devuelve las que tienen forma de número de carta, mejores primero.
    // expH: altura esperada de los dígitos (px).
    wordBlobs(bin, w, h, expH, max, opts) {
      opts = opts || {};
      const minRatio = opts.minRatio != null ? opts.minRatio : 2.2, maxRatio = opts.maxRatio != null ? opts.maxRatio : 8;
      const hMin = opts.hMin != null ? opts.hMin : 0.55, hMax = opts.hMax != null ? opts.hMax : 1.7; // altura de palabra admitida (× expH)
      const lab = new Int32Array(w * h), st = new Int32Array(w * h); let n = 0; const comps = [];
      for (let s0 = 0; s0 < w * h; s0++) {
        if (!bin[s0] || lab[s0]) continue;
        const id = ++n; let sp = 0; st[sp++] = s0; lab[s0] = id; let x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0;
        while (sp > 0) {
          const j = st[--sp]; area++; const yy = (j / w) | 0, xx = j - yy * w;
          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          if (xx > 0 && bin[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st[sp++] = j - 1; }
          if (xx < w - 1 && bin[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st[sp++] = j + 1; }
          if (yy > 0 && bin[j - w] && !lab[j - w]) { lab[j - w] = id; st[sp++] = j - w; }
          if (yy < h - 1 && bin[j + w] && !lab[j + w]) { lab[j + w] = id; st[sp++] = j + w; }
        }
        const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
        // glifos plausibles: altura entre 0.45 y 1.8 veces la esperada; no líneas ni cajas enormes
        if (bh >= expH * hMin * 0.8 && bh <= expH * hMax * 1.06 && bw <= expH * hMax * 4.5 && area >= expH * expH * 0.04) comps.push({ x0, x1, y0, y1, k: 1 });
      }
      comps.sort((p, q) => p.x0 - q.x0);
      const words = [];
      for (const c of comps) {
        let merged = false;
        for (const wd of words) {
          const ov = Math.min(wd.y1, c.y1) - Math.max(wd.y0, c.y0) + 1, hh = Math.max(wd.y1 - wd.y0, c.y1 - c.y0) + 1, hm = Math.min(wd.y1 - wd.y0, c.y1 - c.y0) + 1;
          const gap = c.x0 - wd.x1 - 1;
          // misma línea, alturas parecidas y hueco pequeño (entre dígitos; los espacios entre palabras son mayores)
          if (ov >= hh * 0.45 && hm >= hh * 0.5 && gap <= hm * 0.25 && gap >= -hh * 0.6) { wd.x1 = Math.max(wd.x1, c.x1); wd.y0 = Math.min(wd.y0, c.y0); wd.y1 = Math.max(wd.y1, c.y1); wd.k++; wd.hs.push(c.y1 - c.y0 + 1); merged = true; break; }
        }
        if (!merged) words.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, k: 1, hs: [c.y1 - c.y0 + 1] });
      }
      // segundo nivel: palabras vecinas de altura parecida ("089/" + "198") forman una frase candidata
      const phrases = [];
      words.sort((p, q) => p.x0 - q.x0);
      for (const wd of words) {
        let merged = false;
        for (const ph of phrases) {
          const ov = Math.min(ph.y1, wd.y1) - Math.max(ph.y0, wd.y0) + 1, hh = Math.max(ph.y1 - ph.y0, wd.y1 - wd.y0) + 1, hm = Math.min(ph.y1 - ph.y0, wd.y1 - wd.y0) + 1;
          const gap = wd.x0 - ph.x1 - 1;
          if (ov >= hh * 0.5 && hm >= hh * 0.75 && gap <= hm * 0.55 && gap >= -hh * 0.3) { ph.x1 = Math.max(ph.x1, wd.x1); ph.y0 = Math.min(ph.y0, wd.y0); ph.y1 = Math.max(ph.y1, wd.y1); ph.k += wd.k; ph.parts++; ph.hs = ph.hs.concat(wd.hs); merged = true; break; }
        }
        if (!merged) phrases.push({ x0: wd.x0, x1: wd.x1, y0: wd.y0, y1: wd.y1, k: wd.k, parts: 1, hs: wd.hs.slice() });
      }
      const out = [];
      const consider = (wd) => {
        const bw = wd.x1 - wd.x0 + 1, bh = wd.y1 - wd.y0 + 1, r = bw / bh;
        if (r < minRatio || r > maxRatio || bh < expH * hMin || bh > expH * hMax) return;
        if (wd.k < 2 && r < 2.8) return;
        if (opts.within && (wd.x0 < opts.within.x0 || wd.x1 > opts.within.x1 || wd.y0 < opts.within.y0 || wd.y1 > opts.within.y1)) return;
        if (out.some(o => o.x0 === wd.x0 && o.x1 === wd.x1 && o.y0 === wd.y0 && o.y1 === wd.y1)) return;
        // uniformidad de alturas: los dígitos miden todos lo mismo; las palabras tienen ascendentes,
        // descendentes y acentos (alturas dispares) → penalización
        let uni = 0;
        if (wd.hs && wd.hs.length >= 3) {
          const m = wd.hs.reduce((a, b) => a + b, 0) / wd.hs.length;
          const sd = Math.sqrt(wd.hs.reduce((a, b) => a + (b - m) * (b - m), 0) / wd.hs.length);
          uni = sd / m;
        }
        // puntuación: proporción cercana a 4.3 (7 glifos), altura cercana a la esperada, varios glifos
        const score = Math.abs(Math.log(r / 4.3)) * 1.2 + Math.abs(Math.log(bh / expH)) * 1.5 + (wd.k >= 4 ? 0 : 0.4) + Math.max(0, uni - 0.14) * 3;
        out.push({ x0: wd.x0, x1: wd.x1, y0: wd.y0, y1: wd.y1, k: wd.k, score, uni: +uni.toFixed(2) });
      };
      for (const ph of phrases) consider(ph);
      for (const wd of words) consider(wd);
      out.sort((p, q) => p.score - q.score);
      return out.slice(0, max);
    },
    // Relleno de halos: a partir de una máscara de píxeles claros (H, 1 = halo), devuelve el texto
    // "encerrado" por los anillos exteriores de halo (dígitos oscuros con contorno claro), engrosado 1 px.
    haloFill(H, cw, ch, expH) {
      const label = new Int32Array(cw * ch); let nLabels = 0;
      const stack = new Int32Array(cw * ch);
      const areas = [], isHalo = [], touchesBorder = [];
      for (let start = 0; start < cw * ch; start++) {
        if (label[start]) continue;
        const kind = H[start]; const id = ++nLabels; let sp = 0, area = 0, border = false;
        stack[sp++] = start; label[start] = id;
        while (sp > 0) {
          const j = stack[--sp]; area++;
          const yy = (j / cw) | 0, xx = j - yy * cw;
          if (xx === 0 || yy === 0 || xx === cw - 1 || yy === ch - 1) border = true;
          if (xx > 0 && !label[j - 1] && H[j - 1] === kind) { label[j - 1] = id; stack[sp++] = j - 1; }
          if (xx < cw - 1 && !label[j + 1] && H[j + 1] === kind) { label[j + 1] = id; stack[sp++] = j + 1; }
          if (yy > 0 && !label[j - cw] && H[j - cw] === kind) { label[j - cw] = id; stack[sp++] = j - cw; }
          if (yy < ch - 1 && !label[j + cw] && H[j + cw] === kind) { label[j + cw] = id; stack[sp++] = j + cw; }
        }
        areas[id] = area; isHalo[id] = kind; touchesBorder[id] = border;
      }
      const outerRing = new Uint8Array(nLabels + 1);
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = yy * cw + xx; if (!H[j]) continue;
        const nb = [j - 1, j + 1, j - cw, j + cw];
        for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (!H[k] && touchesBorder[label[k]]) { outerRing[label[j]] = 1; break; } }
      }
      const isText = new Uint8Array(nLabels + 1);
      const maxArea = Math.pow(expH * 1.6, 2), minArea = 10;
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = yy * cw + xx; if (H[j]) continue;
        const id = label[j]; if (touchesBorder[id] || areas[id] > maxArea || areas[id] < minArea || isText[id]) continue;
        const nb = [j - 1, j + 1, j - cw, j + cw];
        for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (H[k] && outerRing[label[k]]) { isText[id] = 1; break; } }
      }
      const T0 = new Uint8Array(cw * ch), T = new Uint8Array(cw * ch);
      for (let j = 0; j < cw * ch; j++) T0[j] = (!H[j] && isText[label[j]]) ? 1 : 0;
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = yy * cw + xx;
        T[j] = T0[j] || ((xx > 0 && T0[j - 1]) || (xx < cw - 1 && T0[j + 1]) || (yy > 0 && T0[j - cw]) || (yy < ch - 1 && T0[j + cw])) ? 1 : 0;
      }
      return T;
    },
    // Trazos encerrados: en la vista "oscuro", los dígitos con halo claro quedan como componentes de tinta
    // aislados dentro del anillo de halo (no-tinta), mientras que el fondo oscuro toca el borde. Devuelve solo
    // los componentes de tinta que no tocan el borde, de tamaño plausible y adyacentes al primer anillo
    // (los contadores interiores de 0/8/9 quedan fuera).
    enclosedDark(bin, cw, ch, expH) {
      const label = new Int32Array(cw * ch); let nLabels = 0; const stack = new Int32Array(cw * ch);
      const areas = [], isInk = [], touchesBorder = [], bh = [];
      for (let start = 0; start < cw * ch; start++) {
        if (label[start]) continue;
        const kind = bin[start]; const id = ++nLabels; let sp = 0, area = 0, border = false, y0 = ch, y1 = 0;
        stack[sp++] = start; label[start] = id;
        while (sp > 0) {
          const j = stack[--sp]; area++;
          const yy = (j / cw) | 0, xx = j - yy * cw;
          if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          if (xx === 0 || yy === 0 || xx === cw - 1 || yy === ch - 1) border = true;
          if (xx > 0 && !label[j - 1] && bin[j - 1] === kind) { label[j - 1] = id; stack[sp++] = j - 1; }
          if (xx < cw - 1 && !label[j + 1] && bin[j + 1] === kind) { label[j + 1] = id; stack[sp++] = j + 1; }
          if (yy > 0 && !label[j - cw] && bin[j - cw] === kind) { label[j - cw] = id; stack[sp++] = j - cw; }
          if (yy < ch - 1 && !label[j + cw] && bin[j + cw] === kind) { label[j + cw] = id; stack[sp++] = j + cw; }
        }
        areas[id] = area; isInk[id] = kind; touchesBorder[id] = border; bh[id] = y1 - y0 + 1;
      }
      // anillos: regiones no-tinta adyacentes a tinta que toca el borde (el fondo)
      const ring1 = new Uint8Array(nLabels + 1);
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = yy * cw + xx; if (bin[j]) continue;
        const nb = [j - 1, j + 1, j - cw, j + cw];
        for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (bin[k] && touchesBorder[label[k]]) { ring1[label[j]] = 1; break; } }
      }
      const isText = new Uint8Array(nLabels + 1);
      const maxArea = Math.pow(expH * 1.6, 2), minArea = expH * expH * 0.03;
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const j = yy * cw + xx; if (!bin[j]) continue;
        const id = label[j]; if (touchesBorder[id] || areas[id] > maxArea || areas[id] < minArea || bh[id] < expH * 0.35 || isText[id]) continue;
        const nb = [j - 1, j + 1, j - cw, j + cw];
        for (const k of nb) { if (k < 0 || k >= cw * ch) continue; if (!bin[k] && ring1[label[k]]) { isText[id] = 1; break; } }
      }
      const T = new Uint8Array(cw * ch);
      for (let j = 0; j < cw * ch; j++) T[j] = (bin[j] && isText[label[j]]) ? 1 : 0;
      return T;
    },
    // Inclinación del texto en una imagen binarizada (radianes): prueba cizallas y' = y − (x − cx)·tan(θ)
    // y se queda con la que deja las filas de tinta más "apretadas" (proyección horizontal más nítida).
    // Sirve para corregir cartas mal enderezadas (borde inferior mal detectado, carta torcida en la funda).
    skewAngle(bin, w, h, maxDeg) {
      maxDeg = maxDeg || 7;
      const xs = [], ys = [];
      const step = Math.max(1, Math.floor((w * h) / 300000));
      for (let j = 0; j < w * h; j += step) if (bin[j]) { xs.push(j % w); ys.push((j / w) | 0); }
      if (xs.length < 300) return 0;
      const cx = w / 2;
      let bestT = 0, bestS = -1, base = 0;
      for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += 0.5) {
        const t = Math.tan(deg * Math.PI / 180);
        const off = Math.ceil(Math.abs(t) * w) + 1;
        const hist = new Float64Array(h + 2 * off + 2);
        for (let i = 0; i < xs.length; i++) { const yy = Math.round(ys[i] - (xs[i] - cx) * t) + off; if (yy >= 0 && yy < hist.length) hist[yy]++; }
        let s = 0; for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
        if (Math.abs(deg) < 1e-9) base = s;
        if (s > bestS) { bestS = s; bestT = t; }
      }
      // solo si mejora claramente respecto a no corregir (evita "corregir" ruido)
      if (bestS < base * 1.08) return 0;
      return Math.atan(bestT);
    },
    // Busca la barra "/" dentro de una palabra binarizada: componente delgado, alto e inclinado hacia la
    // derecha que no está en los extremos. Devuelve las cajas izquierda y derecha o null.
    splitAtSlash(bin, w, h, bl) {
      const W = bl.x1 - bl.x0 + 1, H = bl.y1 - bl.y0 + 1;
      const lab = new Int32Array(W * H), st = new Int32Array(W * H); const comps = [];
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        const j0 = yy * W + xx; if (lab[j0] || !bin[(bl.y0 + yy) * w + bl.x0 + xx]) continue;
        const id = comps.length + 1; let sp = 0; st[sp++] = j0; lab[j0] = id;
        let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0, sxTop = 0, nTop = 0, sxBot = 0, nBot = 0;
        while (sp > 0) {
          const j = st[--sp]; area++; const cy = (j / W) | 0, cx = j - cy * W;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
          if (cy < H * 0.4) { sxTop += cx; nTop++; } else if (cy > H * 0.6) { sxBot += cx; nBot++; }
          const nb = [[cx > 0, j - 1], [cx < W - 1, j + 1], [cy > 0, j - W], [cy < H - 1, j + W]];
          for (const [ok, q] of nb) { if (!ok || lab[q]) continue; const qy = (q / W) | 0, qx = q - qy * W; if (bin[(bl.y0 + qy) * w + bl.x0 + qx]) { lab[q] = id; st[sp++] = q; } }
        }
        comps.push({ x0, x1, y0, y1, area, slant: nTop && nBot ? (sxTop / nTop - sxBot / nBot) : 0 });
      }
      const big = comps.filter(c => (c.y1 - c.y0 + 1) >= H * 0.5 && c.area >= 8).sort((a, b) => a.x0 - b.x0);
      if (big.length < 3) return null;
      let bestC = null, bestS = 0;
      for (let i = 1; i < big.length - 1; i++) {
        const c = big[i], ch = c.y1 - c.y0 + 1, cw = c.x1 - c.x0 + 1;
        if (ch < H * 0.7 || cw > ch * 0.6) continue;
        const fill = c.area / (cw * ch);
        const sc = (c.slant / ch) - fill * 0.5;          // muy inclinado y poco relleno (trazo fino) → barra
        if (c.slant >= ch * 0.22 && fill <= 0.5 && sc > bestS) { bestS = sc; bestC = c; }
      }
      if (!bestC) return null;
      const left = big.filter(c => c.x1 < bestC.x0 + (bestC.x1 - bestC.x0) * 0.3), right = big.filter(c => c.x0 > bestC.x1 - (bestC.x1 - bestC.x0) * 0.3);
      if (!left.length || !right.length) return null;
      const box = (arr) => ({ x0: bl.x0 + Math.min(...arr.map(c => c.x0)), x1: bl.x0 + Math.max(...arr.map(c => c.x1)), y0: bl.y0 + Math.min(...arr.map(c => c.y0)), y1: bl.y0 + Math.max(...arr.map(c => c.y1)) });
      return { left: box(left), right: box(right) };
    },
    // Recorte binarizado (negro sobre blanco) de una caja con margen, en un lienzo con nombre propio
    binCrop(binSrc, w, h, box, pad, key) {
      const bw = box.x1 - box.x0 + 1 + pad * 2, bh = box.y1 - box.y0 + 1 + pad * 2;
      const lc = cv(key, bw, bh), lx = ctx2d(lc), id = lx.createImageData(bw, bh);
      for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
        const gx = box.x0 - pad + xx, gy = box.y0 - pad + yy;
        const ink = gx >= 0 && gy >= 0 && gx < w && gy < h ? binSrc[gy * w + gx] : 0;
        const o = (yy * bw + xx) * 4; const v = ink ? 0 : 255; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
      }
      lx.putImageData(id, 0, 0);
      return lc;
    },
    // Componentes de tinta (cajas de caracteres, marcos) dentro de una región, con filtros de tamaño.
    components(bin, w, h, within, f) {
      const x0r = Math.max(0, Math.floor(within.x0)), x1r = Math.min(w - 1, Math.ceil(within.x1)), y0r = Math.max(0, Math.floor(within.y0)), y1r = Math.min(h - 1, Math.ceil(within.y1));
      if (x1r <= x0r || y1r <= y0r) return [];
      const lab = new Int32Array(w * h), st = new Int32Array(w * h); const out = []; let n = 0;
      for (let yy = y0r; yy <= y1r; yy++) for (let xx = x0r; xx <= x1r; xx++) {
        const s0 = yy * w + xx; if (!bin[s0] || lab[s0]) continue;
        const id = ++n; let sp = 0; st[sp++] = s0; lab[s0] = id; let bx0 = w, bx1 = 0, by0 = h, by1 = 0, area = 0;
        while (sp > 0) {
          const j = st[--sp]; area++; const y = (j / w) | 0, x = j - y * w;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
          if (x > x0r && bin[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st[sp++] = j - 1; }
          if (x < x1r && bin[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st[sp++] = j + 1; }
          if (y > y0r && bin[j - w] && !lab[j - w]) { lab[j - w] = id; st[sp++] = j - w; }
          if (y < y1r && bin[j + w] && !lab[j + w]) { lab[j + w] = id; st[sp++] = j + w; }
        }
        const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
        if (bh >= f.minH && bh <= f.maxH && bw >= f.minW && bw <= f.maxW && area >= bw * bh * (f.minFill || 0)) out.push({ x0: bx0, x1: bx1, y0: by0, y1: by1, area, fill: area / (bw * bh) });
      }
      return out;
    },
    // Recorte en gris de una zona del lienzo, invertido si se pide, con contraste estirado y ampliado.
    grayCrop(zc, box, scale, invert, pad, key) {
      const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
      const d = ctx2d(zc).getImageData(box.x0, box.y0, bw, bh).data;
      const g = new Uint8Array(bw * bh); const hist = new Int32Array(256);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { let v = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8; if (invert) v = 255 - v; g[j] = v; hist[v]++; }
      let acc = 0, lo = 0, hi = 255; const tot = bw * bh;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= tot * 0.03) { lo = v; break; } }
      acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= tot * 0.03) { hi = v; break; } }
      if (hi - lo < 30) hi = lo + 30;
      const tmp = cv(key + '-src', bw, bh), tx = ctx2d(tmp), id = tx.createImageData(bw, bh);
      for (let j = 0; j < bw * bh; j++) { const o = Math.max(0, Math.min(255, Math.round((g[j] - lo) / (hi - lo) * 255))); id.data[j * 4] = id.data[j * 4 + 1] = id.data[j * 4 + 2] = o; id.data[j * 4 + 3] = 255; }
      tx.putImageData(id, 0, 0);
      const ow = Math.round(bw * scale) + pad * 2, oh = Math.round(bh * scale) + pad * 2;
      const oc = cv(key, ow, oh), ox = ctx2d(oc);
      ox.fillStyle = '#fff'; ox.fillRect(0, 0, ow, oh);
      ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
      ox.drawImage(tmp, pad, pad, Math.round(bw * scale), Math.round(bh * scale));
      return oc;
    },
    // Reconoce un código de idioma de dos letras (EN, ES, FR, DE, IT, PT) por correlación con plantillas
    // dibujadas con la fuente del sistema: robusto al desenfoque, que a Tesseract le cuesta en letras tan
    // pequeñas. crop: lienzo en gris con el texto oscuro sobre claro. Devuelve {lang, score, margin} o null.
    LANG_TEMPLATES: ['EN', 'ES', 'FR', 'DE', 'IT', 'PT'],
    _tplCache: null,
    inkVector(canvas, TW, TH) {
      const w = canvas.width, h = canvas.height, d = ctx2d(canvas).getImageData(0, 0, w, h).data;
      const ink = new Float32Array(w * h); const vals = [];
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { ink[j] = 255 - ((d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8); vals.push(ink[j]); }
      vals.sort((a, b) => a - b);
      const lo = vals[Math.floor(vals.length * 0.05)], hi = vals[Math.floor(vals.length * 0.97)];
      if (hi - lo < 20) return null;
      for (let j = 0; j < ink.length; j++) ink[j] = Math.max(0, Math.min(1, (ink[j] - lo) / (hi - lo)));
      // caja de la tinta (filas/columnas con tinta apreciable)
      const rows = new Float32Array(h), cols = new Float32Array(w);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = ink[y * w + x] > 0.45 ? 1 : 0; rows[y] += v; cols[x] += v; }
      let y0 = 0, y1 = h - 1, x0 = 0, x1 = w - 1;
      while (y0 < h && rows[y0] < w * 0.04) y0++; while (y1 > y0 && rows[y1] < w * 0.04) y1--;
      while (x0 < w && cols[x0] < h * 0.04) x0++; while (x1 > x0 && cols[x1] < h * 0.04) x1--;
      if (x1 - x0 < 4 || y1 - y0 < 4) return null;
      // remuestreo a TW x TH (media por celda) y normalización (media 0, norma 1)
      const out = new Float32Array(TW * TH);
      for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
        const sy0 = y0 + (y1 - y0 + 1) * ty / TH, sy1 = y0 + (y1 - y0 + 1) * (ty + 1) / TH, sx0 = x0 + (x1 - x0 + 1) * tx / TW, sx1 = x0 + (x1 - x0 + 1) * (tx + 1) / TW;
        let sum = 0, n = 0;
        for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) { sum += ink[y * w + x]; n++; }
        out[ty * TW + tx] = n ? sum / n : 0;
      }
      let m = 0; for (let j = 0; j < out.length; j++) m += out[j]; m /= out.length;
      let nrm = 0; for (let j = 0; j < out.length; j++) { out[j] -= m; nrm += out[j] * out[j]; }
      nrm = Math.sqrt(nrm) || 1; for (let j = 0; j < out.length; j++) out[j] /= nrm;
      return { v: out, aspect: (x1 - x0 + 1) / (y1 - y0 + 1) };
    },
    langByTemplate(crop) {
      const TW = 40, TH = 20;
      const q = this.inkVector(crop, TW, TH); if (!q) return null;
      if (!this._tplCache) {
        this._tplCache = [];
        for (const code of this.LANG_TEMPLATES) for (const font of ['bold 64px sans-serif', 'bold 64px "Arial Narrow", "Roboto Condensed", sans-serif']) {
          const c = cv('lang-tpl', 220, 110), x = ctx2d(c);
          x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000'; x.font = font; x.textBaseline = 'middle';
          x.fillText(code, 20, 55);
          // desenfoque leve (como en la foto): reduce y amplía
          const b = cv('lang-tpl-b', 55, 28), bx = ctx2d(b); bx.imageSmoothingEnabled = true; bx.drawImage(c, 0, 0, 55, 28);
          const c2 = cv('lang-tpl-2', 220, 110), x2 = ctx2d(c2); x2.imageSmoothingEnabled = true; x2.drawImage(b, 0, 0, 220, 110);
          const t = this.inkVector(c2, TW, TH); if (t) this._tplCache.push({ code, v: t.v, aspect: t.aspect });
        }
      }
      const scores = new Map();
      for (const t of this._tplCache) {
        let dot = 0; for (let j = 0; j < q.v.length; j++) dot += q.v[j] * t.v[j];
        // penaliza proporciones muy distintas
        dot -= Math.min(0.25, Math.abs(Math.log(q.aspect / t.aspect)) * 0.3);
        if (!scores.has(t.code) || scores.get(t.code) < dot) scores.set(t.code, dot);
      }
      const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return null;
      return { lang: ranked[0][0], score: +ranked[0][1].toFixed(3), margin: +(ranked[0][1] - (ranked[1] ? ranked[1][1] : 0)).toFixed(3), ranked: ranked.map(r => r[0] + ':' + r[1].toFixed(2)) };
    },
    // En el recorte gris (texto oscuro sobre claro) del interior de la caja del código, encuentra la caja de
    // las letras pequeñas del idioma: columnas con tinta de poca altura a la derecha de las letras grandes.
    smallCodeBox(lc) {
      const w = lc.width, h = lc.height, d = ctx2d(lc).getImageData(0, 0, w, h).data;
      const g = new Uint8Array(w * h); const vals = [];
      for (let i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = 255 - ((d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8); vals.push(g[j]); }
      vals.sort((a, b) => a - b);
      const lo = vals[Math.floor(vals.length * 0.4)], hi = vals[Math.floor(vals.length * 0.97)];
      if (hi - lo < 25) return null;
      const thr = lo + (hi - lo) * 0.5;
      const top = new Int16Array(w).fill(-1), bot = new Int16Array(w).fill(-1), cnt = new Int16Array(w);
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (g[y * w + x] > thr) { if (top[x] < 0) top[x] = y; bot[x] = y; cnt[x]++; }
      // altura de las letras grandes: la más común entre las columnas con tinta abundante
      const ext = []; for (let x = 0; x < w; x++) if (cnt[x] >= 3) ext.push(bot[x] - top[x] + 1);
      if (ext.length < 6) return null;
      ext.sort((a, b) => a - b);
      const bigH = ext[Math.floor(ext.length * 0.85)];
      const extOf = (x) => bot[x] - top[x] + 1;
      const isBorder = (x) => cnt[x] >= 2 && extOf(x) > bigH * 1.15;      // borde de la caja (artefacto)
      const isSmall = (x) => cnt[x] >= 2 && !isBorder(x) && extOf(x) <= bigH * 0.8 && extOf(x) >= bigH * 0.3;
      const isBig = (x) => cnt[x] >= 2 && !isBorder(x) && extOf(x) > bigH * 0.8;
      // desde la derecha: salta columnas vacías o de borde, recoge las pequeñas hasta topar con una grande
      let x1 = w - 1; while (x1 > 0 && (cnt[x1] < 2 || isBorder(x1))) x1--;
      let x0 = x1, gap = 0, found = false;
      for (let x = x1; x >= 0; x--) {
        if (isBig(x)) break;
        if (isSmall(x)) { if (!found) { x1 = x; found = true; } x0 = x; gap = 0; } else if (found && ++gap > bigH * 0.5) break;
      }
      if (!found) return null;
      if (x1 - x0 < bigH * 0.5) return null;
      let y0 = h, y1 = 0; for (let x = x0; x <= x1; x++) if (isSmall(x)) { if (top[x] < y0) y0 = top[x]; if (bot[x] > y1) y1 = bot[x]; }
      const padx = Math.round(bigH * 0.1), pady = Math.round(bigH * 0.1);
      return { x0: Math.max(0, x0 - padx), x1: Math.min(w - 1, x1 + padx), y0: Math.max(0, y0 - pady), y1: Math.min(h - 1, y1 + pady), bigH };
    },
    // Código de colección e idioma impresos a la izquierda del número: caja negra con letras blancas
    // ("PRE" grande + "ES" pequeño) en las cartas desde Espada y Escudo. zc: lienzo de la zona (ya sin
    // inclinación); numBl: caja del número; expH: altura de los dígitos. Devuelve {set, lang, raw, conf} o null.
    async readSetCode(zc, numBl, expH, worker, entry, opts) {
      const { bin, w, h } = this.sauvola(zc, false, 0.2, 45); // vista "oscuro": la caja negra es tinta
      const within = { x0: Math.max(0, numBl.x0 - expH * 9), x1: numBl.x0 - 1, y0: numBl.y0 - expH * 1.3, y1: numBl.y1 + expH * 1.3 };
      if (within.x1 - within.x0 < expH * 2) return null;
      // la caja del código: componente oscuro ancho (la marca de regulación es casi cuadrada y va más a la izquierda)
      const boxes = this.components(bin, w, h, within, { minH: expH * 1.1, maxH: expH * 2.6, minW: expH * 2.0, maxW: expH * 7, minFill: 0.35 })
        .filter(b => numBl.x0 - b.x1 < expH * 3.5)
        .sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
      if (entry) entry.lines.push('cajas:' + boxes.map(b => `${b.x1 - b.x0}x${b.y1 - b.y0}@${b.x0}`).join(';'));
      if (!boxes.length) return null;
      const box = boxes[0];
      // interior de la caja (sin el borde) en gris invertido (letras negras sobre blanco), ampliado x2
      const inset = Math.max(1, Math.round((box.y1 - box.y0) * 0.08));
      const inner = { x0: box.x0 + inset, x1: box.x1 - inset, y0: box.y0 + inset, y1: box.y1 - inset };
      const lc = this.grayCrop(zc, inner, 2, true, 18, 'ocr-code');
      if (opts && opts.keepStrips && entry) { try { (entry.crops = entry.crops || []).push(lc.toDataURL('image/png')); } catch (e) { /* nada */ } }
      await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ', tessedit_pageseg_mode: '7' });
      const rr = await worker.recognize(lc);
      const t = (rr.data.text || '').replace(/\s+/g, ' ').trim();
      if (entry) entry.lines.push('código:' + t.slice(0, 16));
      let p = this.parseSetCode(t);
      // el código de idioma va en letras pequeñas a la derecha de la caja ("PRE" grande + "ES" pequeño):
      // si no se leyó junto con el código, se lee aparte ampliado x3
      if (!p || !p.lang) {
        // localiza las letras pequeñas: columnas con tinta de poca altura a la derecha de las letras grandes
        const small = this.smallCodeBox(lc);
        if (small) {
          const lc2 = cv('ocr-code2', Math.round((small.x1 - small.x0 + 1) * 1.5) + 40, Math.round((small.y1 - small.y0 + 1) * 1.5) + 40), x2 = ctx2d(lc2);
          x2.fillStyle = '#fff'; x2.fillRect(0, 0, lc2.width, lc2.height); x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high';
          x2.drawImage(lc, small.x0, small.y0, small.x1 - small.x0 + 1, small.y1 - small.y0 + 1, 20, 20, lc2.width - 40, lc2.height - 40);
          if (opts && opts.keepStrips && entry) { try { (entry.crops = entry.crops || []).push(lc2.toDataURL('image/png')); } catch (e) { /* nada */ } }
          await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: '8' });
          const r2 = await worker.recognize(lc2);
          const t2 = (r2.data.text || '').toUpperCase().replace(/[^A-Z]/g, '');
          if (entry) entry.lines.push('idioma:' + t2.slice(0, 8));
          let cand = t2.length >= 2 ? [t2.slice(-2), t2.slice(0, 2)].find(c => this.LANG_CODES.includes(c)) : null;
          // Tesseract falla con letras tan pequeñas y borrosas: correlación con plantillas EN/ES/FR/DE/IT/PT
          const tm = this.langByTemplate(lc2);
          if (entry && tm) entry.lines.push('plantilla:' + tm.lang + ' ' + tm.score + ' Δ' + tm.margin);
          if (!cand && tm && tm.score >= 0.45 && tm.margin >= 0.06) cand = tm.lang;
          if (cand) { if (!p) p = { set: '', lang: cand, raw: t + ' ' + t2 }; else { p.lang = cand; p.raw = t + ' ' + t2; } if (tm) p.tpl = tm.ranked; }
        }
      }
      return p ? Object.assign(p, { conf: rr.data.confidence || 0 }) : { set: '', lang: '', raw: t, conf: rr.data.confidence || 0 };
    },
    // ---------- Idioma de la carta por las palabras impresas ----------
    // Diccionario por idioma (mayúsculas, sin acentos). Las palabras compartidas por varios idiomas pesan
    // menos (1/nº de idiomas que la usan): "RESISTENCIA" vale para ES y PT, "DEBILIDAD" solo para ES.
    LANG_DICT: {
      ES: ['BASICO', 'FASE', 'ENTRENADOR', 'OBJETO', 'PARTIDARIO', 'ESTADIO', 'HERRAMIENTA', 'ENERGIA', 'DEBILIDAD', 'RESISTENCIA', 'RETIRADA', 'TURNO', 'PUEDES', 'CARTAS', 'DANO', 'ATAQUE', 'CUALQUIER', 'DURANTE', 'CANTIDAD', 'JUGAR', 'BUSCA', 'BARAJA', 'ADVERSARIO', 'ACTIVO', 'BANCA', 'MANO', 'EVOLUCIONA'],
      EN: ['BASIC', 'STAGE', 'TRAINER', 'ITEM', 'SUPPORTER', 'STADIUM', 'TOOL', 'ENERGY', 'WEAKNESS', 'RESISTANCE', 'RETREAT', 'TURN', 'YOUR', 'CARDS', 'DAMAGE', 'ATTACK', 'DURING', 'PLAY', 'SEARCH', 'DECK', 'OPPONENT', 'ACTIVE', 'BENCH', 'HAND', 'THIS', 'WITH', 'EVOLVES', 'FROM'],
      FR: ['NIVEAU', 'DRESSEUR', 'OBJET', 'STADE', 'OUTIL', 'ENERGIE', 'FAIBLESSE', 'RESISTANCE', 'RETRAITE', 'VOTRE', 'CARTES', 'DEGATS', 'ATTAQUE', 'PENDANT', 'JOUER', 'CHERCHEZ', 'ADVERSAIRE', 'ACTIF', 'BANC', 'MAIN', 'AVEC', 'EVOLUE'],
      DE: ['BASIS', 'PHASE', 'UNTERSTUTZER', 'STADION', 'AUSRUSTUNG', 'ENERGIE', 'SCHWACHE', 'RESISTENZ', 'RUCKZUG', 'DEINEM', 'KARTEN', 'SCHADEN', 'ATTACKE', 'WAHREND', 'SPIELEN', 'DURCHSUCHE', 'GEGNER', 'AKTIVEN', 'BANK', 'HAND', 'DEINER', 'MIT', 'ENTWICKELT', 'SICH', 'AUS'],
      IT: ['ALLENATORE', 'STRUMENTO', 'AIUTO', 'OGGETTO', 'STADIO', 'ENERGIA', 'DEBOLEZZA', 'RESISTENZA', 'RITIRATA', 'TURNO', 'CARTE', 'DANNO', 'ATTACCO', 'DURANTE', 'GIOCARE', 'CERCA', 'MAZZO', 'AVVERSARIO', 'ATTIVO', 'PANCHINA', 'MANO', 'PUOI', 'EVOLVE'],
      PT: ['ESTAGIO', 'TREINADOR', 'APOIADOR', 'FERRAMENTA', 'ENERGIA', 'FRAQUEZA', 'RESISTENCIA', 'RECUO', 'TURNO', 'CARTAS', 'DANO', 'ATAQUE', 'DURANTE', 'JOGAR', 'PROCURE', 'BARALHO', 'OPONENTE', 'ATIVO', 'BANCO', 'MAO', 'VOCE', 'PODE', 'EVOLUI']
    },
    _dictIndex: null,
    langScores(text) {
      if (!this._dictIndex) {
        const idx = new Map();
        for (const [lang, words] of Object.entries(this.LANG_DICT)) for (const wd of words) { if (!idx.has(wd)) idx.set(wd, []); idx.get(wd).push(lang); }
        this._dictIndex = idx;
      }
      const t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ');
      const tokens = [...new Set(t.split(' ').filter(x => x.length >= 4))];
      const scores = {}; const hits = [];
      const lev = (a, b) => {
        if (Math.abs(a.length - b.length) > 2) return 99;
        const prev = new Array(b.length + 1); for (let j = 0; j <= b.length; j++) prev[j] = j;
        for (let i = 1; i <= a.length; i++) {
          let diag = prev[0]; prev[0] = i;
          for (let j = 1; j <= b.length; j++) { const tmp = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = tmp; }
        }
        return prev[b.length];
      };
      for (const tok of tokens) {
        let best = null, bestD = 99;
        for (const [wd, langs] of this._dictIndex) {
          const maxD = wd.length >= 9 ? 3 : wd.length >= 6 ? 2 : wd.length >= 5 ? 1 : 0;
          const d = lev(tok, wd);
          if (d <= maxD && d < bestD) { bestD = d; best = [wd, langs]; }
        }
        if (best) { const wgt = 1 / best[1].length; for (const l of best[1]) scores[l] = (scores[l] || 0) + wgt; hits.push(tok + '→' + best[0]); }
      }
      const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) return null;
      const margin = ranked[0][1] - (ranked[1] ? ranked[1][1] : 0);
      return { lang: ranked[0][0], score: ranked[0][1], margin, hits, ranked: ranked.map(r => r[0] + ':' + r[1].toFixed(2)) };
    },
    // Zona de la carta en gris con contraste estirado (texto oscuro sobre claro, o invertido), corrigiendo
    // la inclinación medida por la vía rápida, ampliada `scale` veces y con margen blanco.
    grayZone(source, sx, sy, sw, sh, zone, scale, region, slot, invert) {
      const zc = this.zoneCanvas(source, sx, sy, sw, sh, zone, scale, region, slot);
      let src = zc;
      const skew = this.lastSkew || 0;
      if (Math.abs(skew) > 0.005) {
        const d = cv('gray-zone-desk' + slot, zc.width, zc.height), dx = ctx2d(d);
        dx.fillStyle = invert ? '#000' : '#fff'; dx.fillRect(0, 0, d.width, d.height);
        dx.setTransform(1, -Math.tan(skew), 0, 1, 0, Math.tan(skew) * zc.width / 2); dx.drawImage(zc, 0, 0); dx.setTransform(1, 0, 0, 1, 0, 0);
        src = d;
      }
      return this.grayCrop(src, { x0: 0, y0: 0, x1: src.width - 1, y1: src.height - 1 }, 1, !!invert, 24, 'gray-zone-out' + slot);
    },
    // Lee palabra por palabra las "palabras" (grupos de glifos) de una zona: localiza los bloques por
    // binarización (texto oscuro o claro) y pasa a Tesseract cada uno recortado en gris y ampliado. Es mucho
    // más fiable que reconocer la franja entera (líneas, símbolos y fondos ilustrados confunden al
    // segmentador). Devuelve [{text, conf, view}] de las `max` palabras más anchas.
    async readWordsIn(zc, expH, worker, max, views, opts) {
      opts = opts || {};
      const cands = [];
      for (const view of views) {
        const { bin, w, h } = this.sauvola(zc, view === 'claro', 0.2, 45);
        const blobs = this.wordBlobs(bin, w, h, expH, 12, { minRatio: opts.minRatio || 2.4, maxRatio: opts.maxRatio || 10 });
        for (const bl of blobs) if (bl.k >= (opts.minGlyphs || 4)) cands.push({ view, bl, bin, w, h, width: bl.x1 - bl.x0 });
      }
      cands.sort((a, b) => b.width - a.width);
      const out = [];
      const seen = [];
      for (const c of cands) {
        if (out.length >= max) break;
        if (seen.some(o => Math.min(o.x1, c.bl.x1) - Math.max(o.x0, c.bl.x0) > (c.bl.x1 - c.bl.x0) * 0.6 && Math.min(o.y1, c.bl.y1) - Math.max(o.y0, c.bl.y0) > 0)) continue;
        seen.push(c.bl);
        const pad = Math.max(10, Math.round((c.bl.y1 - c.bl.y0 + 1) * 0.45));
        const box = { x0: Math.max(0, c.bl.x0 - pad), x1: Math.min(zc.width - 1, c.bl.x1 + pad), y0: Math.max(0, c.bl.y0 - pad), y1: Math.min(zc.height - 1, c.bl.y1 + pad) };
        const gc = this.grayCrop(zc, box, 1.5, c.view === 'claro', 16, 'ocr-word');
        await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '8' });
        let rr = await worker.recognize(gc);
        let text = (rr.data.text || '').replace(/\s+/g, ' ').trim(), conf = rr.data.confidence || 0;
        if (conf < 55) {
          // segundo intento con la máscara binarizada (fondos ilustrados)
          const bc = this.binCrop(c.bin, c.w, c.h, c.bl, pad, 'ocr-word-bin');
          rr = await worker.recognize(bc);
          const t2 = (rr.data.text || '').replace(/\s+/g, ' ').trim(), c2 = rr.data.confidence || 0;
          if (c2 > conf) { text = t2; conf = c2; }
        }
        if (opts.keepStrips) { try { (opts.crops = opts.crops || []).push(gc.toDataURL('image/png')); } catch (e) { /* nada */ } }
        out.push({ text, conf: Math.round(conf), view: c.view });
      }
      return out;
    },
    // Detecta el idioma de la carta leyendo palabras impresas. Devuelve {lang, how, raw, tried} (lang '' si no
    // se pudo). Pasos: 1) etiqueta de la esquina superior izquierda ("BÁSICO", "FASE 1", "OBJETO"…);
    // 2) fila Debilidad/Resistencia/Retirada (Pokémon) o texto de reglas (Entrenadores) en la parte baja.
    async detectLanguage(source, sx, sy, sw, sh, region, timeLeft, opts) {
      opts = opts || {};
      const workers = await this.ensureWorkers(1, null, true);
      const worker = workers && workers[0]; if (!worker) return null;
      const tried = [];
      const restore = async () => { await worker.setParameters({ tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: '11' }).catch(() => {}); };
      const finish = (lang, how, raw, extra) => { restore(); return Object.assign({ lang, how, raw, tried }, extra || {}); };
      let allText = '';
      // zona con la inclinación corregida (medida por la vía rápida), fondo blanco
      const zoneOf = (zone, SC, slot) => {
        const zc = this.zoneCanvas(source, sx, sy, sw, sh, zone, SC, region, slot);
        const skew = this.lastSkew || 0; if (Math.abs(skew) <= 0.005) return zc;
        const d = cv('lang-zone-desk' + slot, zc.width, zc.height), dx = ctx2d(d);
        dx.fillStyle = '#fff'; dx.fillRect(0, 0, d.width, d.height);
        dx.setTransform(1, -Math.tan(skew), 0, 1, 0, Math.tan(skew) * zc.width / 2); dx.drawImage(zc, 0, 0); dx.setTransform(1, 0, 0, 1, 0, 0);
        return d;
      };
      // 1) etiqueta superior izquierda: palabra pequeña ("BÁSICO", "STAGE 1"…) a la izquierda del nombre
      if (!timeLeft || timeLeft() > 1200) {
        const SC = 2.5, zc = zoneOf([0.02, 0.42, 0.012, 0.085], SC, 3);
        // etiqueta pequeña ("BÁSICO") o grande ("Objeto", "Partidario" en Entrenadores): alturas 0.7–3 × 1.25 %
        const words = await this.readWordsIn(zc, sh * 0.0125 * SC, worker, 2, ['claro', 'oscuro'], { minRatio: 2.2, maxRatio: 9, minGlyphs: 4, hMin: 0.7, hMax: 3.0, keepStrips: opts.keepStrips, crops: opts.crops = opts.crops || [] });
        const txt = words.map(w => w.text).join(' ');
        tried.push('etiqueta:' + words.map(w => `${w.text}(${w.conf}${w.view[0]})`).join(' '));
        allText += ' ' + txt;
        const sc = this.langScores(txt);
        if (sc && sc.score >= 0.9 && sc.margin >= 0.4) return finish(sc.lang, 'etiqueta', txt, { hits: sc.hits });
      }
      // 2) parte baja: Debilidad/Resistencia/Retirada (Pokémon) o texto de reglas (Entrenador)
      if (!timeLeft || timeLeft() > 1500) {
        const SC = 2.2, zc = zoneOf([0.03, 0.97, 0.78, 0.925], SC, 4);
        const words = await this.readWordsIn(zc, sh * 0.0135 * SC, worker, 6, ['oscuro', 'claro'], { minRatio: 2.6, maxRatio: 10, minGlyphs: 3, hMin: 0.6, hMax: 1.8, keepStrips: opts.keepStrips, crops: opts.crops });
        const txt = words.map(w => w.text).join(' ');
        tried.push('texto:' + words.map(w => `${w.text}(${w.conf}${w.view[0]})`).join(' '));
        allText += ' ' + txt;
        const sc = this.langScores(txt);
        if (sc && sc.score >= 0.9 && sc.margin >= 0.4) return finish(sc.lang, 'texto', txt, { hits: sc.hits });
        const sc2 = this.langScores(allText);
        if (sc2 && sc2.score >= 1.0 && sc2.margin >= 0.5) return finish(sc2.lang, 'texto+etiqueta', allText.trim(), { hits: sc2.hits });
      }
      return finish('', '', allText.trim());
    },
    /**
     * Vía rápida: localiza las palabras con forma de número en la zona inferior de la carta (binarización
     * local a 3x) y las lee ampliadas solo con dígitos. Vota entre dos binarizaciones y ambas polaridades.
     * Devuelve {r, w} (lectura y peso de votos) o null. Añade entradas a diag.
     */
    async readNumberFast(source, sx, sy, sw, sh, workers, diag, timeLeftTotal, darkBg, region, opts) {
      const SCALE = 3, WL_NUM = '0123456789/';
      const expH = sh * 0.0135 * SCALE;                     // altura típica de los dígitos (1.35% de la carta)
      // banda ancha (0.885–0.995): si el borde inferior se detectó unos milímetros más abajo (funda,
      // sombra), el número queda más arriba de lo esperado
      const zones = [[0.02, 0.62, 0.885, 0.995], [0.38, 0.98, 0.885, 0.995]]; // izquierda (modernas) y derecha (antiguas)
      // la vía rápida gasta como mucho la mitad del presupuesto (9 s): en el teléfono cada lectura tarda
      // ~0.5–1 s y las pasadas de respaldo (bandas distintas) necesitan su turno
      const fastDeadline = performance.now() + Math.min(timeLeftTotal() * 0.5, 9000);
      const timeLeft = () => Math.min(timeLeftTotal(), fastDeadline - performance.now());
      this.lastSkew = 0;
      let codeInfo = null;
      const votes = new Map();
      const vote = (r, w) => { const k = r.num + '/' + r.total; const v = votes.get(k) || { r, w: 0 }; v.w += w; votes.set(k, v); };
      const best = () => [...votes.values()].sort((a, b) => b.w - a.w)[0] || null;
      const confirmed = () => { const b = best(); return b && b.w >= 2.0 ? b : null; };
      const stripOf = (bin, w, h, blobs) => {
        try {
          const sc = cv('ocr-fast-strip', w, h), sx2 = ctx2d(sc), id = sx2.createImageData(w, h);
          for (let j = 0; j < w * h; j++) { const v = bin[j] ? 0 : 255; id.data[j * 4] = id.data[j * 4 + 1] = id.data[j * 4 + 2] = v; id.data[j * 4 + 3] = 255; }
          sx2.putImageData(id, 0, 0);
          sx2.strokeStyle = '#f00'; sx2.lineWidth = 3; for (const bl of blobs) sx2.strokeRect(bl.x0 - 4, bl.y0 - 4, bl.x1 - bl.x0 + 9, bl.y1 - bl.y0 + 9);
          return sc.toDataURL('image/png');
        } catch (e) { return undefined; }
      };
      const cropOf = (binSrc, w, h, box, pad, key) => this.binCrop(binSrc, w, h, box, pad, key);
      // Lee una palabra: primero número y total por separado si se distingue la barra (evita que la barra
      // inclinada se lea como "7"); si no, la palabra entera (PSM 8) y, si no convence, como línea (PSM 7).
      const readBlob = async (bin, w, h, bl, entry, worker, slot) => {
        let sp = this.splitAtSlash(bin, w, h, bl), binUse = bin;
        for (let er = 1; !sp && er <= 2; er++) {   // glifos pegados (negrita): se adelgazan 1-2 px
          const eb = new Uint8Array(w * h);
          for (let yy = bl.y0; yy <= bl.y1; yy++) for (let xx = bl.x0; xx <= bl.x1; xx++) {
            const j = yy * w + xx; if (!bin[j]) continue;
            let keep = true;
            for (let dy = -er; dy <= er && keep; dy++) for (let dx = -er; dx <= er; dx++) { const yy2 = yy + dy, xx2 = xx + dx; if (yy2 < 0 || xx2 < 0 || yy2 >= h || xx2 >= w || !bin[yy2 * w + xx2]) { keep = false; break; } }
            if (keep) eb[j] = 1;
          }
          sp = this.splitAtSlash(eb, w, h, bl); if (sp) binUse = eb;
        }
        let p = null;
        if (sp) {
          const readPart = async (box) => {
            const pc = cropOf(binUse, w, h, box, Math.max(20, Math.round((box.y1 - box.y0 + 1) * 0.4)), 'ocr-fast-part' + slot);
            await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '8' });
            const rr = await worker.recognize(pc);
            return { t: (rr.data.text || '').replace(/\D/g, ''), conf: rr.data.confidence || 0 };
          };
          const a = await readPart(sp.left), b = await readPart(sp.right);
          entry.lines.push(a.t + '|' + b.t);
          if (a.t && b.t) {
            const cand = this.parse(a.t + '/' + b.t, null, true);
            if (cand) { cand.conf = Math.min(a.conf, b.conf); vote(cand, cand.conf >= 85 ? 2.0 : cand.conf >= 60 ? 1.4 : 1.0); if (cand.conf >= 60) return cand; p = cand; }
          }
          if (timeLeft() < 1200) return p;
        }
        const lc = cropOf(bin, w, h, bl, Math.max(24, Math.round((bl.y1 - bl.y0 + 1) * 0.4)), 'ocr-fast-line' + slot);
        if (opts && opts.keepStrips) { try { (entry.crops = entry.crops || []).push(lc.toDataURL('image/png')); } catch (e) { /* nada */ } }
        for (const psm of ['8', '7']) {
          await worker.setParameters({ tessedit_char_whitelist: WL_NUM, tessedit_pageseg_mode: psm });
          const rr = await worker.recognize(lc);
          const t = (rr.data.text || '').replace(/\s+/g, ' ').trim();
          entry.lines.push(t.slice(0, 24));
          const q = this.parse(t, rr.data, true);
          if (q) {
            const conf = q.conf || 0;
            // una lectura limpia y muy segura vale por dos; si la barra se leyó como dígito ("0897198" →
            // 089/198) cuenta 1.0 y necesita confirmación
            vote(q, q.guessed ? (conf >= 80 ? 1.0 : 0.7) : (conf >= 88 ? 2.0 : conf >= 70 ? 1.6 : 1.0));
            p = p || q;
            if (!q.guessed && conf >= 70) break;
          }
          if (timeLeft() < 1200) break;
        }
        return p;
      };
      for (let zi = 0; zi < zones.length; zi++) {
        const zone = zones[zi];
        if (timeLeft() < 1500) break;
        let zc = this.zoneCanvas(source, sx, sy, sw, sh, zone, SCALE, region, 0);
        const t0 = performance.now();
        // 0) inclinación del texto (carta mal enderezada): se mide en la vista "oscuro" y se corrige con
        //    una cizalla antes de buscar las palabras
        let skewDeg = 0, darkView = this.sauvola(zc, false, 0.2, 45);
        const ang = this.skewAngle(darkView.bin, darkView.w, darkView.h, 7);
        if (Math.abs(ang) > 0.006) {
          const zc2 = cv('ocr-zone-desk' + zi, zc.width, zc.height), x2 = ctx2d(zc2);
          x2.fillStyle = '#808080'; x2.fillRect(0, 0, zc2.width, zc2.height);
          x2.setTransform(1, -Math.tan(ang), 0, 1, 0, Math.tan(ang) * zc.width / 2);
          x2.drawImage(zc, 0, 0);
          x2.setTransform(1, 0, 0, 1, 0, 0);
          zc = zc2; darkView = this.sauvola(zc, false, 0.2, 45);
          skewDeg = +(ang * 180 / Math.PI).toFixed(1);
          if (zi === 0) this.lastSkew = ang;
        }
        // 1) tres "vistas": texto oscuro, texto claro y dígitos oscuros con halo claro (trazos encerrados)
        const cands = [], entries = [];
        for (const view of ['oscuro', 'claro', 'halo']) {
          let bin, w, h;
          // la vista "halo" usa un umbral más laxo (k bajo): los trazos finos de los dígitos deben quedar
          // completos; el ruido de fondo lo elimina la condición topológica (componentes encerrados)
          if (view === 'halo') { const r = this.sauvola(zc, false, 0.08, 45); w = r.w; h = r.h; bin = this.enclosedDark(r.bin, w, h, expH); }
          else if (view === 'oscuro') { bin = darkView.bin; w = darkView.w; h = darkView.h; }
          else { const r = this.sauvola(zc, true, 0.2, 45); bin = r.bin; w = r.w; h = r.h; }
          const blobs = this.wordBlobs(bin, w, h, expH, 4);
          const entry = { band: [zone[2], zone[3]], x: [zone[0], zone[1]], mode: 'rápida ' + view, text: blobs.length + ' palabras', ms: 0, hit: false, lines: [] };
          if (skewDeg) entry.skew = skewDeg;
          if (opts && opts.keepStrips) entry.strip = stripOf(bin, w, h, blobs);
          entries.push(entry);
          const light = view === 'claro';
          for (const bl of blobs) {
            // preferencia: 5-9 glifos (dígitos + barra); la vista que coincide con el fondo va primero;
            // el número está pegado al borde izquierdo (modernas) o al derecho (antiguas), no en el centro
            // (ahí va la línea de copyright)
            const kPen = (bl.k >= 5 && bl.k <= 9) ? 0 : (bl.k >= 3 && bl.k <= 11 ? 0.15 : 0.4);
            const posPen = zi === 0 ? (bl.x0 / w > 0.45 ? 0.35 : 0) : (bl.x1 / w < 0.5 ? 0.35 : 0);
            cands.push({ view, bl, bin, w, h, entry, score: bl.score + kPen + posPen + (view === 'halo' ? 0.05 : (light === darkBg ? 0 : 0.15)) });
          }
        }
        cands.sort((p, q) => p.score - q.score);
        let winner = null;
        const top = cands.slice(0, 4);
        for (let i = 0; i < top.length; i += workers.length) {
          if (timeLeft() < 1200 || confirmed()) break;
          const batch = top.slice(i, i + workers.length);
          const res = await Promise.all(batch.map((c, k) => readBlob(c.bin, c.w, c.h, c.bl, c.entry, workers[k], k).catch(() => null)));
          for (let k = 0; k < batch.length; k++) if (res[k] && !winner) winner = batch[k];
        }
        // 2) confirmación con otra binarización de la misma vista si hay lectura pero no está confirmada
        if (winner && !confirmed() && timeLeft() > 1500) {
          let { bin, w, h } = this.sauvola(zc, winner.view === 'claro', winner.view === 'halo' ? 0.12 : 0.25, 30);
          if (winner.view === 'halo') bin = this.enclosedDark(bin, w, h, expH);
          const blobs = this.wordBlobs(bin, w, h, expH, 3);
          const entry = { band: [zone[2], zone[3]], x: [zone[0], zone[1]], mode: 'rápida ' + winner.view + ' (2ª)', text: blobs.length + ' palabras', ms: 0, hit: false, lines: [] };
          if (opts && opts.keepStrips) entry.strip = stripOf(bin, w, h, blobs);
          entries.push(entry);
          const wb = winner.bl;
          const bl = blobs.find(b => Math.min(b.x1, wb.x1) - Math.max(b.x0, wb.x0) > (wb.x1 - wb.x0) * 0.5 && Math.min(b.y1, wb.y1) - Math.max(b.y0, wb.y0) > 0) || blobs[0];
          if (bl) await readBlob(bin, w, h, bl, entry, workers[0], 0);
        }
        const b = best();
        // 3) código de colección e idioma ("PRE ES") a la izquierda del número (zona izquierda, cartas modernas)
        if (b && zi === 0 && winner && timeLeft() > 900) {
          this.lastFast = { zc, winner, expH };
          try { codeInfo = await this.readSetCode(zc, winner.bl, expH, workers[0], entries[0], opts); } catch (e) { codeInfo = { error: String(e && e.message || e) }; }
        }
        for (const en of entries) { en.ms = Math.round(performance.now() - t0); if (b) { en.hit = true; en.best = b.r.num + '/' + b.r.total + ':' + b.w.toFixed(1); } if (diag) diag.push(en); }
        if (b) break; // con lectura en esta zona (aunque no confirmada) no se prueba la otra
      }
      const out = best();
      if (out && codeInfo) out.code = codeInfo;
      return out;
    },
    // Encuentra en la franja binarizada los "bloques de palabra" con la forma de un número de carta
    // ("033/088": varios glifos seguidos, entre 2 y 8 veces más anchos que altos). Une componentes
    // vecinos en horizontal. Devuelve hasta `max` bloques, los más parecidos a un número primero.
    numberBlobs(copy, h, max) {
      const w = copy.width, ch = copy.height, d = ctx2d(copy).getImageData(0, 0, w, ch).data;
      const b = new Uint8Array(w * ch); let ink = 0; for (let j = 0; j < w * ch; j++) { b[j] = d[j * 4] < 128 ? 1 : 0; ink += b[j]; }
      const lab = new Int32Array(w * ch), st = new Int32Array(w * ch); let n = 0; const comps = [];
      for (let s0 = 0; s0 < w * ch; s0++) {
        if (!b[s0] || lab[s0]) continue;
        const id = ++n; let sp = 0; st[sp++] = s0; lab[s0] = id; let x0 = w, x1 = 0, y0 = ch, y1 = 0, area = 0;
        while (sp > 0) {
          const j = st[--sp]; area++; const yy = (j / w) | 0, xx = j - yy * w;
          if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
          if (xx > 0 && b[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st[sp++] = j - 1; }
          if (xx < w - 1 && b[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st[sp++] = j + 1; }
          if (yy > 0 && b[j - w] && !lab[j - w]) { lab[j - w] = id; st[sp++] = j - w; }
          if (yy < ch - 1 && b[j + w] && !lab[j + w]) { lab[j + w] = id; st[sp++] = j + w; }
        }
        const bh = y1 - y0 + 1;
        // glifos plausibles: entre el 9% y el 45% de la altura de la franja; se ignoran motas y líneas largas
        if (bh >= h * 0.09 && bh <= h * 0.45 && (x1 - x0 + 1) <= h * 0.9 && area >= 12) comps.push({ x0, x1, y0, y1, k: 1 });
      }
      // une componentes vecinos (solape vertical ≥ 50%, hueco horizontal ≤ 45% de la altura)
      comps.sort((p, q) => p.x0 - q.x0);
      const words = [];
      for (const c of comps) {
        let merged = false;
        for (const wd of words) {
          const ov = Math.min(wd.y1, c.y1) - Math.max(wd.y0, c.y0) + 1, hh = Math.min(wd.y1 - wd.y0, c.y1 - c.y0) + 1;
          const gap = c.x0 - wd.x1 - 1;
          if (ov >= hh * 0.5 && gap <= hh * 0.25 && gap >= -hh) { wd.x1 = Math.max(wd.x1, c.x1); wd.y0 = Math.min(wd.y0, c.y0); wd.y1 = Math.max(wd.y1, c.y1); wd.k++; merged = true; break; }
        }
        if (!merged) words.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, k: 1 });
      }
      const out = [];
      const consider = (wd) => {
        const bw = wd.x1 - wd.x0 + 1, bh = wd.y1 - wd.y0 + 1, r = bw / bh;
        if (bh < h * 0.1 || r < 2 || r > 8) return;
        if (wd.k < 3 && r < 2.6) return;   // un solo glifo ancho (caja, símbolo) no es un número
        if (out.some(o => o.x0 === wd.x0 && o.x1 === wd.x1 && o.y0 === wd.y0 && o.y1 === wd.y1)) return;
        out.push({ x0: wd.x0, x1: wd.x1, y0: wd.y0, y1: wd.y1, k: wd.k, score: Math.abs(r - 4.3) });
      };
      for (const wd of words) consider(wd);
      // también los componentes sueltos anchos (dígitos pegados entre sí forman un solo bloque)
      for (const c of comps) consider(c);
      out.sort((p, q) => p.score - q.score);
      return { blobs: out.slice(0, max), inkFrac: ink / (w * ch) };
    },
    /**
     * Lee el número impreso. Prueba varios modos de binarización (dígitos con halo, texto claro sobre oscuro,
     * texto oscuro sobre claro…) y franjas (por si la guía quedó desplazada), la mitad izquierda (cartas
     * modernas) y la derecha (cartas antiguas). En cada pasada, además del OCR de toda la franja, relee
     * ampliados los bloques con forma de número y vota. Se detiene en cuanto una lectura queda confirmada
     * o al agotar el tiempo (opts.budgetMs). diag (opcional) recoge el texto crudo de cada pasada.
     */
    async readNumber(source, sx, sy, sw, sh, onStatus, diag, opts) {
      opts = opts || {};
      const nWorkers = opts.parallel === false ? 1 : ((navigator.hardwareConcurrency || 2) >= 4 ? 2 : 1);
      const workers = await this.ensureWorkers(nWorkers, onStatus, false);
      const tStart = performance.now();
      const budget = opts.budgetMs || 60000;
      const timeLeft = () => budget - (performance.now() - tStart);
      // Orden de pasadas según el fondo de la zona del número: fondo oscuro → primero texto claro.
      const bg = this.numberAreaBrightness(source, sx, sy, sw, sh);
      const darkBg = bg < 105;
      const L = [0, 0.6], R = [0.4, 1];
      // Franjas: el número va a ~0.95 de la altura de la carta; la principal lo deja centrado y las otras
      // cubren recortes algo cortos o largos.
      const B1 = [0.885, 0.995], B2 = [0.86, 0.97], B3 = [0.905, 1.0];
      const passes = darkBg ? [
        [...B1, L, 'outline'], [...B1, L, 'local-inv'], [...B2, L, 'outline'], [...B2, L, 'local-inv'],
        [...B1, L, 'adaptive'], [...B3, L, 'outline'], [...B3, L, 'local-inv'], [...B1, L, 'outline-inv'],
        [...B1, R, 'local-inv'], [...B1, R, 'adaptive'], [...B1, L, 'bright'], [...B2, L, 'adaptive']
      ] : [
        [...B1, L, 'outline'], [...B1, L, 'adaptive'], [...B2, L, 'outline'], [...B1, L, 'local-inv'],
        [...B1, L, 'outline-inv'], [...B3, L, 'outline'], [...B2, L, 'adaptive'], [...B3, L, 'adaptive'],
        [...B1, R, 'adaptive'], [...B1, R, 'outline'], [...B1, L, 'dark'], [...B2, L, 'local-inv']
      ];
      const WL_ALL = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ', WL_NUM = '0123456789/';
      const sameLen = (r) => (r.num.replace(/\D/g, '').length === r.total.replace(/\D/g, '').length) ? 1 : 0;
      if (diag) diag.push({ probe: { bg, darkBg, workers: workers.length } });
      // votos acumulados entre pasadas: "033/088" → {r, w}
      const votes = new Map();
      // 0) vía rápida por palabras (la que resuelve casi todos los casos); si confirma, se devuelve ya
      let fastRes = null;
      try { fastRes = await this.readNumberFast(source, sx, sy, sw, sh, workers, diag, timeLeft, darkBg, opts.region, opts); } catch (e) { if (diag) diag.push({ fastError: String(e && e.message || e) }); }
      if (fastRes && fastRes.w >= 2.0) { const r = Object.assign({}, fastRes.r); r.votes = fastRes.r.num + '/' + fastRes.r.total + ':' + fastRes.w.toFixed(1); r.weak = false; delete r.guessed; if (fastRes.code) { r.setCode = fastRes.code.set || ''; r.lang = fastRes.code.lang || ''; r.codeRaw = fastRes.code.raw || ''; r.langTpl = fastRes.code.tpl || null; } await workers[0].setParameters({ tessedit_char_whitelist: WL_ALL, tessedit_pageseg_mode: '11' }); return r; }
      if (fastRes) votes.set(fastRes.r.num + '/' + fastRes.r.total, { r: fastRes.r, w: fastRes.w, direct: 1 });
      const vote = (r, w) => { if (!r) return; const k = r.num + '/' + r.total; const v = votes.get(k) || { r, w: 0, direct: 0 }; v.w += w; if (!r.guessed) v.direct++; votes.set(k, v); };
      const best = () => { const arr = [...votes.values()].sort((a, b) => b.w - a.w || (sameLen(b.r) - sameLen(a.r))); return arr[0] || null; };
      const confirmed = () => { const t = best(); return t && t.w >= 2.0 ? t : null; };
      const setP = async (worker, wl, psm) => { await worker.setParameters({ tessedit_char_whitelist: wl, tessedit_pageseg_mode: psm }); };
      // Una pasada completa (binarización + OCR global + relectura de bloques) en un trabajador.
      const runPass = async ([y0, y1, [x0, x1], mode], worker, slot) => {
        const strip = this.prepareStrip(source, sx, sy, sw, sh, mode, y0, y1, x0, x1, slot);
        const copy = cv('ocr-copy' + slot, strip.width, strip.height);   // copia estable (prepareStrip reutiliza el lienzo)
        copy.getContext('2d').drawImage(strip, 0, 0);
        const hStrip = strip.height - 56;
        const t0 = performance.now();
        const entry = { band: [y0, y1], x: [x0, x1], mode, text: '', ms: 0, hit: false, lines: [] };
        const { blobs, inkFrac } = this.numberBlobs(copy, hStrip, 2);
        // 1) OCR de toda la franja (texto disperso) solo si no hay bloques con forma de número o la franja
        //    está limpia: en franjas "sucias" Tesseract tarda mucho y devuelve basura.
        if (!blobs.length || inkFrac < 0.03) {
          if (timeLeft() < 1200) return entry;
          await setP(worker, WL_ALL, '11');
          const { data } = await worker.recognize(copy);
          const text = (data.text || '').trim();
          entry.text = text.replace(/\s+/g, ' ').slice(0, 80);
          const p1 = this.parse(text, data);
          if (p1) vote(p1, p1.guessed ? 0.5 : (p1.conf >= 80 ? 1.6 : 1.0));
        } else entry.text = '(' + blobs.length + ' bloques, ' + Math.round(inkFrac * 100) + '% tinta, sin OCR global)';
        // 2) relectura ampliada de los bloques con forma de número (solo dígitos), independiente de cómo
        //    haya segmentado Tesseract la franja; si sale algo, se confirma a otra escala en la misma pasada
        for (const bl of blobs) {
          if (timeLeft() < 900 || confirmed()) break;
          const pad = 10, bw = bl.x1 - bl.x0 + 1 + pad * 2, bh = bl.y1 - bl.y0 + 1 + pad * 2;
          const readAt = async (scaleK, key) => {
            const scale = Math.min(3.5, Math.max(1.2, scaleK / bh));
            const lc = cv(key + slot, Math.round(bw * scale), Math.round(bh * scale));
            const lx = ctx2d(lc); lx.imageSmoothingEnabled = true; lx.imageSmoothingQuality = 'high';
            lx.fillStyle = '#fff'; lx.fillRect(0, 0, lc.width, lc.height);
            lx.drawImage(copy, bl.x0 - pad, bl.y0 - pad, bw, bh, 0, 0, lc.width, lc.height);
            const r = await worker.recognize(lc);
            const t = (r.data.text || '').trim();
            entry.lines.push(t.slice(0, 30));
            return this.parse(t, r.data, true);
          };
          await setP(worker, WL_NUM, '7');
          const p2 = await readAt(90, 'ocr-line');
          if (p2) vote(p2, p2.guessed ? 0.9 : (p2.conf >= 85 && sameLen(p2) ? 1.5 : 1.2));
          if (p2 && !p2.guessed && timeLeft() > 900) {
            const p3 = await readAt(135, 'ocr-line2');
            if (p3) vote(p3, p3.guessed ? 0.6 : 1.0);
          }
        }
        entry.ms = Math.round(performance.now() - t0);
        if (opts.keepStrips) { try { entry.strip = copy.toDataURL('image/png'); } catch (e) { /* sin memoria */ } }
        return entry;
      };
      const finish = async (v, strong) => {
        for (const w of workers) await setP(w, WL_ALL, '11');
        if (!v) return null;
        const r = Object.assign({}, v.r);
        r.votes = [...votes.values()].sort((a, b) => b.w - a.w).map(x => x.r.num + '/' + x.r.total + ':' + x.w.toFixed(1)).join(' ');
        r.weak = !strong; delete r.guessed;
        if (fastRes && fastRes.code && fastRes.r.num === r.num) { r.setCode = fastRes.code.set || ''; r.lang = fastRes.code.lang || ''; r.codeRaw = fastRes.code.raw || ''; r.langTpl = fastRes.code.tpl || null; }
        return r;
      };
      // pasadas de una en una (o de dos en dos con dos trabajadores) hasta confirmar una lectura
      for (let i = 0; i < passes.length && timeLeft() >= 1500; i += workers.length) {
        const chunk = passes.slice(i, i + workers.length);
        const entries = await Promise.all(chunk.map((pass, k) => runPass(pass, workers[k], k).catch(e => ({ band: pass.slice(0, 2), x: pass[2], mode: pass[3], text: 'error: ' + (e && e.message || e), ms: 0, hit: false, lines: [] }))));
        const top = best();
        for (const en of entries) { en.hit = !!top; if (top) en.best = top.r.num + '/' + top.r.total + ':' + top.w.toFixed(1); if (diag) diag.push(en); }
        if (top && top.w >= 2.0) return finish(top, true);
      }
      const top = best();
      return finish(top, !!(top && top.w >= 2.0));
    }
  };

  window.Vision = {
    SIG_LEN, SIG_VERSION: 2, ART, Index, signature, signatureFromStage, normalizeSig, queryVariants, computeSignatures, loadImage, stage, OCR, rectifyCard, setWeights
  };
})();
