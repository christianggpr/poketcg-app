'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Carta } from '@/lib/catalogo';
import { nombreColeccion } from '@/lib/catalogo';
import { cajasOrdenadas } from '@/lib/coleccion';
import { reconocedor } from '@/lib/huellas';
import { identificar, NOMBRES_IDIOMA, type ResultadoIdentificacion } from '@/lib/identificar';
import { cargarVision, prefs, type Rect } from '@/lib/vision';
import { APP_VERSION } from '@/lib/config';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
import { CardRow } from '../CardRow';
import { CardPicker } from '../CardPicker';
import { AddEntrySheet } from '../AddEntrySheet';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';

type EstadoCam = 'iniciando' | 'lista' | 'foto' | 'error';

export function Escanear() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const toast = useToast();
  const rec = reconocedor();
  const idioma = perfil.idioma_nombres;

  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);
  const snap = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const streamInfo = useRef<unknown>(null);
  const activo = useRef(true);
  const [cam, setCam] = useState<{ estado: EstadoCam; msg: string }>({ estado: 'iniciando', msg: 'Iniciando cámara…' });
  const [mostrarSnap, setMostrarSnap] = useState(false);
  const [preparado, setPreparado] = useState({ cartas: 0, sets: 0, cargado: false });
  const [ocrOk, setOcrOk] = useState(false);
  const [ocrEstado, setOcrEstado] = useState('');
  const [ocrPref, setOcrPref] = useState(true);
  const [scanSet, setScanSet] = useState('');
  const [cajaId, setCajaId] = useState<string | null>(null);
  const [identificando, setIdentificando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoIdentificacion | null>(null);
  const [, setTick] = useState(0);
  const [recorte, setRecorte] = useState<HTMLCanvasElement | null>(null);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [manual, setManual] = useState(false);

  const detenerCamara = useCallback(() => {
    if (stream.current) { stream.current.getTracks().forEach(t => t.stop()); stream.current = null; }
    if (video.current) video.current.srcObject = null;
  }, []);

  const iniciarCamara = useCallback(async () => {
    detenerCamara();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCam({ estado: 'foto', msg: '' });
      return;
    }
    setCam({ estado: 'iniciando', msg: 'Iniciando cámara…' });
    try {
      let s: MediaStream;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      } catch {
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      }
      if (!activo.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      try {
        const tr = s.getVideoTracks()[0]; const st = tr.getSettings ? tr.getSettings() : {};
        streamInfo.current = { w: st.width, h: st.height, fps: st.frameRate, facing: st.facingMode, label: tr.label };
        tr.onended = () => { if (stream.current === s) { stream.current = null; if (activo.current && !document.hidden) setTimeout(() => { if (!stream.current) iniciarCamara(); }, 800); } };
      } catch { streamInfo.current = null; }
      setCam({ estado: 'lista', msg: '' });
    } catch (e) {
      setCam({ estado: 'error', msg: `No se pudo abrir la cámara (${(e as Error).name || (e as Error).message}). Revisa el permiso de cámara o usa "Subir foto".` });
    }
  }, [detenerCamara]);

  useEffect(() => {
    activo.current = true;
    setOcrPref(prefs.ocr); setScanSet(prefs.scanSet);
    setCajaId(col.ultimaCajaId);
    rec.load().then(() => setPreparado({ cartas: rec.cartasIndexadas, sets: rec.prepared.size, cargado: true }));
    cargarVision().then(v => {
      const ok = v.OCR.isSupported(); setOcrOk(ok);
      if (ok && prefs.ocr) v.OCR.ensure(m => setOcrEstado(m.status)).then(() => setOcrEstado('')).catch(() => setOcrEstado('OCR no disponible'));
    }).catch(e => toast('No se pudo cargar el módulo de visión: ' + (e as Error).message, 'danger'));
    iniciarCamara();
    const onVis = () => { if (document.hidden) detenerCamara(); else if (activo.current && !stream.current && !resultado) iniciarCamara(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { activo.current = false; document.removeEventListener('visibilitychange', onVis); detenerCamara(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  function rectGuia(): Rect {
    const W = wrap.current!.clientWidth, H = wrap.current!.clientHeight;
    const v = video.current!; const vw = v.videoWidth, vh = v.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    const offX = (W - vw * scale) / 2, offY = (H - vh * scale) / 2;
    const gr = guide.current!.getBoundingClientRect(), wr = wrap.current!.getBoundingClientRect();
    return { x: (gr.left - wr.left - offX) / scale, y: (gr.top - wr.top - offY) / scale, w: gr.width / scale, h: gr.height / scale };
  }
  function mostrarInstantanea(c: HTMLCanvasElement) {
    const s = snap.current; if (!s) return;
    s.width = c.width; s.height = c.height; s.getContext('2d')!.drawImage(c, 0, 0);
    setMostrarSnap(true);
    setTimeout(() => setMostrarSnap(false), 900);
  }
  async function correrIdentificacion(source: HTMLCanvasElement, r: Rect) {
    setResultado(null);
    setIdentificando('Enderezando la carta…');
    try {
      const R = await identificar(cat, rec, source, r, { ocr: ocrPref, scanSet, onEstado: t => setIdentificando(t), streamInfo: streamInfo.current });
      setResultado(R);
      const lp = R.diag.langPromise as Promise<string> | undefined;
      if (lp) lp.then(() => setTick(t => t + 1));
    } catch (e) {
      toast('No se pudo identificar: ' + (e as Error).message, 'danger');
    } finally {
      setIdentificando(null);
    }
  }
  async function capturar() {
    const v = video.current;
    if (!stream.current || !v || !v.videoWidth) { document.getElementById('photoInput')?.click(); return; }
    const frame = document.createElement('canvas'); frame.width = v.videoWidth; frame.height = v.videoHeight;
    frame.getContext('2d')!.drawImage(v, 0, 0);
    const r = rectGuia();
    mostrarInstantanea(frame);
    await correrIdentificacion(frame, r);
  }
  async function cargarFoto(file: File) {
    let bmp: ImageBitmap;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { try { bmp = await createImageBitmap(file); } catch { toast('No se pudo leer la foto', 'danger'); return; } }
    const max = 2800; const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    setRecorte(c);
  }
  function elegir(c: Carta) {
    if (cajaId) { try { localStorage.setItem('poketcg:ultimaCaja', cajaId); } catch { /* nada */ } }
    setAgregar(c);
  }
  function trasGuardar() {
    setResultado(null);
    if (!stream.current && activo.current && cam.estado !== 'foto') iniciarCamara();
  }

  const sets = cat.sets.slice().sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  const cajas = cajasOrdenadas(col.cajas);
  const R = resultado;
  const confTxt = (c: 'hi' | 'mid' | 'lo') => (c === 'hi' ? ['hi', 'Coincidencia alta'] : c === 'mid' ? ['mid', 'Coincidencia media'] : ['lo', 'Coincidencia baja']);

  return (
    <div>
      <div className="cam-wrap" ref={wrap}>
        <video ref={video} autoPlay playsInline muted hidden={mostrarSnap || cam.estado !== 'lista'} />
        <canvas className="snap" ref={snap} hidden={!mostrarSnap} />
        {cam.estado === 'lista' ? <div className="guide" ref={guide}><div className="hint">Encuadra la carta dentro del marco</div></div> : null}
        {cam.estado === 'iniciando' ? <div className="cam-status">{cam.msg}</div> : null}
        {cam.estado === 'foto' ? <div className="cam-off"><div className="big">📷</div><div><b>Toca el botón amarillo para tomar la foto</b><br /><span className="small">Se abre la cámara del celular. Llena el encuadre con la carta, con buena luz y sin reflejos. En la PC puedes subir una foto.</span></div></div> : null}
        {cam.estado === 'error' ? <div className="cam-off"><div className="big">📷</div><div>{cam.msg}</div><button className="btn" onClick={iniciarCamara}>Reintentar</button></div> : null}
      </div>
      <div className="cam-controls">
        <label className="btn" htmlFor="fileInput">🖼️ Subir foto</label>
        <input id="fileInput" type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) cargarFoto(f); e.target.value = ''; }} />
        <input id="photoInput" type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) cargarFoto(f); e.target.value = ''; }} />
        <div className="grow" style={{ textAlign: 'center' }}><button className="shutter" title="Capturar" onClick={capturar} disabled={!!identificando}>📸</button></div>
        <button className="btn" onClick={() => setManual(true)}>⌨️ Buscar a mano</button>
      </div>

      {identificando ? (
        <div className="panel" style={{ marginTop: 14 }}><b>Identificando…</b><div className="small muted">{identificando}</div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: '35%' }} /></div></div>
      ) : null}

      {R ? (
        <div style={{ marginTop: 14 }}>
          <div className="panel">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={R.shot} style={{ width: 60, borderRadius: 6 }} alt="" />
              <div className="grow">
                <b>{R.list.length ? '¿Cuál es tu carta?' : 'No se encontraron coincidencias'}</b>
                <div className="small muted">
                  {R.ocr ? <>Número leído: <span className="kbd">{String(R.ocr.num)}/{String(R.ocr.total)}</span>{R.ocr.weak ? ' (dudoso)' : ''}{R.ocr.setCode ? <> · colección <span className="kbd">{R.ocr.setCode}</span></> : null}</> : ocrOk && ocrPref ? 'No se pudo leer el número impreso.' : null}
                  {R.lang ? <> · idioma <span className="kbd">{R.lang}</span>{NOMBRES_IDIOMA[R.lang] ? ` (${NOMBRES_IDIOMA[R.lang]})` : ''}</> : R.langPending ? <> · <span className="faint">detectando idioma…</span></> : null}
                  {R.visualCount ? ` · ${R.visualCount} candidatas por imagen` : ''}
                </div>
                <div className="small muted">{R.list.length ? 'Toca la carta correcta para guardarla. Si no está, usa "Buscar a mano".' : !R.diag.prepared.cards ? 'No hay colecciones preparadas: solo se intentó leer el número. Prepara tus colecciones en Ajustes → Reconocimiento para identificar por imagen.' : 'Prueba con más luz, sin reflejos y la carta llenando el marco, o usa "Buscar a mano".'}</div>
                {R.list.length && !R.diag.prepared.cards ? <div className="small" style={{ marginTop: 4, color: 'var(--warn)' }}>Sin colecciones preparadas: estas candidatas salen solo del número leído. <Link href="/app/ajustes#reconocimiento">Prepara tus colecciones</Link> para identificar por imagen.</div> : null}
              </div>
              <button className="btn sm" onClick={() => { setResultado(null); if (!stream.current && cam.estado !== 'foto') iniciarCamara(); }}>↻</button>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Detalles técnicos (para diagnóstico)</summary>
              <div className="small" style={{ marginTop: 6 }}>App {APP_VERSION} · Recorte: {R.diag.rectified ? 'bordes detectados y carta enderezada' : 'marco de la guía (no se detectaron bordes)'} · huellas: {R.diag.prepared.cards} cartas de {R.diag.prepared.sets} colecciones · OCR: {R.diag.ocrSupported ? (R.diag.ocrError ? 'error: ' + String(R.diag.ocrError) : `${R.diag.ocrPasses.filter(p => p.mode).length} pasadas, ${String(R.diag.ocrMs)} ms`) : 'no disponible'}</div>
              {R.diag.ocrPasses.some(p => p.mode) ? <div className="tiny muted" style={{ marginTop: 4 }}>Texto OCR: {R.diag.ocrPasses.filter(p => p.mode).map(p => p.text || '—').join(' | ')}</div> : null}
              <div className="btn-group" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={async () => { const txt = JSON.stringify(R.diag, (k, v) => (k === 'strip' || k === 'crops' || k === 'langPromise' ? undefined : v), 1); try { await navigator.clipboard.writeText(txt); toast('Informe copiado: pégalo en el chat', 'ok'); } catch { descargarTexto('poketcg-diagnostico.json', txt); } }}>Copiar informe</button>
                <button className="btn sm" onClick={() => { const a = document.createElement('a'); a.href = R.shotFull || R.shot; a.download = 'poketcg-recorte.jpg'; document.body.appendChild(a); a.click(); a.remove(); }}>Guardar recorte</button>
              </div>
            </details>
          </div>
          {R.list.length ? (
            <div className="card-list" style={{ marginTop: 10 }}>
              {R.list.map(k => {
                const [cls, label] = confTxt(k.conf);
                return <CardRow key={k.card.id} carta={k.card} entradas={col.entradas.filter(e => e.carta_id === k.card.id)} ubicador={ubicador} onClick={() => elegir(k.card)} extra={<div style={{ marginTop: 4 }}><span className={`score ${cls}`}>{label}{k.num ? ' · nº' : ''}{k.tot ? '+total' : ''}{k.code ? '+código' : ''}</span></div>} />;
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {!preparado.cargado ? null : !preparado.cartas && !(ocrOk && ocrPref) ? (
          <div className="notice warn" style={{ marginBottom: 10 }}>Para reconocer cartas por imagen, primero prepara tus colecciones en <Link href="/app/ajustes#reconocimiento">Ajustes → Reconocimiento por cámara</Link>.</div>
        ) : !preparado.cartas ? (
          <div className="notice info" style={{ marginBottom: 10 }}>Se leerá el número impreso de la carta (OCR){ocrEstado ? ` · ${ocrEstado}` : ''}. Para identificar también por imagen, prepara tus colecciones en <Link href="/app/ajustes#reconocimiento">Ajustes → Reconocimiento por cámara</Link>.</div>
        ) : (
          <div className="small muted" style={{ marginBottom: 8 }}>Reconocimiento listo: {preparado.cartas.toLocaleString('es-PE')} cartas de {preparado.sets} {preparado.sets === 1 ? 'colección' : 'colecciones'}{ocrOk && ocrPref ? ' + lectura del número' : ''}{ocrEstado ? ` · ${ocrEstado}` : ''}.</div>
        )}
      </div>
      <div className="row wrap" style={{ marginTop: 6 }}>
        <div className="field grow"><label>Guardar en la caja</label>
          <select className="input" value={cajaId || ''} onChange={e => { setCajaId(e.target.value || null); try { localStorage.setItem('poketcg:ultimaCaja', e.target.value); } catch { /* nada */ } }}>
            {cajas.length ? cajas.map(b => <option key={b.id} value={b.id}>📦 {b.nombre}</option>) : <option value="">— crea una caja en Cajas —</option>}
          </select></div>
        <div className="field grow"><label>Limitar a una colección (opcional, mejora el acierto)</label>
          <select className="input" value={scanSet} onChange={e => { setScanSet(e.target.value); prefs.scanSet = e.target.value; }}>
            <option value="">Todas las colecciones preparadas</option>
            <optgroup label="Internacional">{sets.filter(s => s.rg !== 'ja').map(s => <option key={s.id} value={s.id}>{nombreColeccion(s, idioma)} ({s.cc || s.ct}){rec.prepared.has(s.id) ? ' ✓' : ''}</option>)}</optgroup>
            <optgroup label="Japón">{sets.filter(s => s.rg === 'ja').map(s => <option key={s.id} value={s.id}>{nombreColeccion(s, idioma)} ({s.cc || s.ct}){rec.prepared.has(s.id) ? ' ✓' : ''}</option>)}</optgroup>
          </select></div>
      </div>

      {recorte ? <Recortador canvas={recorte} onClose={() => setRecorte(null)} onOk={(r) => { const c = recorte; setRecorte(null); mostrarInstantanea(c); correrIdentificacion(c, r); }} /> : null}
      {manual ? <CardPicker onPick={c => { setManual(false); elegir(c); }} onClose={() => setManual(false)} /> : null}
      {agregar ? <AddEntrySheet carta={agregar} idiomaInicial={R?.lang || ''} cajaInicial={cajaId} onClose={() => setAgregar(null)} onGuardada={() => trasGuardar()} /> : null}
    </div>
  );
}

function descargarTexto(nombre: string, contenido: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: 'application/json' })); a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Recorte manual de una foto subida: marco con proporción de carta, arrastrable y redimensionable. */
function Recortador({ canvas, onClose, onOk }: { canvas: HTMLCanvasElement; onClose: () => void; onOk: (r: Rect) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; r: Rect } | null>(null);
  const AR = 63 / 88;
  const src = canvas.toDataURL('image/jpeg', 0.85);

  const ajustar = useCallback((r: Rect | null): Rect => {
    const W = wrap.current?.clientWidth || 300, H = img.current?.clientHeight || wrap.current?.clientHeight || 300;
    let out = r;
    if (!out) { let h = H * 0.9, w = h * AR; if (w > W * 0.9) { w = W * 0.9; h = w / AR; } out = { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
    out = { ...out };
    out.w = Math.min(out.w, W); out.h = out.w / AR; if (out.h > H) { out.h = H; out.w = out.h * AR; }
    out.x = Math.max(0, Math.min(W - out.w, out.x)); out.y = Math.max(0, Math.min(H - out.h, out.y));
    return out;
  }, [AR]);

  useEffect(() => {
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const d = drag.current; if (!d) return;
      const p = 'touches' in ev ? ev.touches[0] : ev;
      const dx = p.clientX - d.sx, dy = p.clientY - d.sy;
      setRect(d.mode === 'move' ? ajustar({ ...d.r, x: d.r.x + dx, y: d.r.y + dy }) : ajustar({ ...d.r, w: Math.max(60, d.r.w + dx) }));
      ev.preventDefault();
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove); window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('touchmove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchend', onUp); };
  }, [ajustar]);

  const empezar = (mode: 'move' | 'resize') => (ev: React.MouseEvent | React.TouchEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const p = 'touches' in ev ? ev.touches[0] : ev;
    drag.current = { mode, sx: p.clientX, sy: p.clientY, r: rect || ajustar(null) };
  };
  const r = rect;
  return (
    <Sheet titulo="Ajusta el marco a la carta" onClose={onClose} pie={<button className="btn primary block" onClick={() => { if (!r || !img.current) return; const scale = canvas.width / img.current.clientWidth; onOk({ x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale }); }}>Identificar carta</button>}>
      <p className="small muted">Arrastra el marco y usa la esquina para cambiar el tamaño.</p>
      <div className="crop-wrap" ref={wrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} src={src} alt="" onLoad={() => setRect(ajustar(null))} />
        {r ? <div className="crop-box" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} onMouseDown={empezar('move')} onTouchStart={empezar('move')}><div className="handle" onMouseDown={empezar('resize')} onTouchStart={empezar('resize')} /></div> : null}
      </div>
    </Sheet>
  );
}
