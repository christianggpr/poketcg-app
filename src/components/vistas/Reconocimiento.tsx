'use client';
import { useEffect, useMemo, useState } from 'react';
import { fold, nombreColeccion } from '@/lib/catalogo';
import { reconocedor, almacenHuellas } from '@/lib/huellas';
import { cargarVision, prefs } from '@/lib/vision';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { SimboloSet } from '../CardRow';
import { Confirmar } from '../Sheet';
import { useToast } from '../Toast';

/** Panel de Ajustes: preparar las huellas visuales de las colecciones y preferencias del escáner. */
export function Reconocimiento() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const rec = reconocedor();
  const [, setTick] = useState(0);
  const [cargado, setCargado] = useState(rec.cargado);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState('');
  const [region, setRegion] = useState<'' | 'intl' | 'ja'>('');
  const [progreso, setProgreso] = useState<{ msg: string; pct: number } | null>(null);
  const [espacio, setEspacio] = useState<number | null>(null);
  const [ocr, setOcr] = useState(true);
  const [ocrSoportado, setOcrSoportado] = useState(true);
  const [borrar, setBorrar] = useState(false);
  const idioma = perfil.idioma_nombres;

  useEffect(() => {
    setOcr(prefs.ocr);
    const f = () => setTick(t => t + 1);
    rec.listeners.add(f);
    rec.load().then(() => { setCargado(true); actualizarEspacio(); });
    cargarVision().then(v => setOcrSoportado(v.OCR.isSupported())).catch(() => {});
    return () => { rec.listeners.delete(f); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  async function actualizarEspacio() { const e = await almacenHuellas.estimate(); setEspacio(e && e.usage ? e.usage : null); }

  const enColeccion = useMemo(() => [...new Set(col.entradas.map(e => cat.carta(e.carta_id)?.s).filter((x): x is string => !!x))], [col.entradas, cat]);
  const lista = useMemo(() => {
    const q = fold(filtro);
    return cat.sets.slice().sort((a, b) => (b.d || '').localeCompare(a.d || '')).filter(s => (!q || (cat.setSearch.get(s.id) || '').includes(q)) && (!region || (region === 'ja' ? s.rg === 'ja' : s.rg !== 'ja')));
  }, [cat, filtro, region]);

  async function preparar(ids: string[]) {
    if (!ids.length) { toast('Selecciona al menos una colección'); return; }
    if (rec.ocupado) { toast('Ya hay una preparación en curso'); return; }
    rec.ocupado = true; rec.cancelar = false;
    let i = 0, ok = 0, compartidas = 0;
    for (const id of ids) {
      if (rec.cancelar) break;
      const nombre = nombreColeccion(cat.coleccion(id), idioma);
      try {
        const meta = await rec.prepararColeccion(cat, id, (d, t) => setProgreso({ msg: `(${i + 1}/${ids.length}) ${nombre}: ${d === 0 ? 'buscando huellas compartidas…' : `${d} de ${t} imágenes`}`, pct: Math.round(((i + (t ? d / t : 1)) / ids.length) * 100) }));
        if (meta) { ok++; if (rec.ultimoOrigen === 'compartidas') compartidas++; if (meta.count < meta.total * 0.5) toast(`${nombre}: solo ${meta.count} de ${meta.total} imágenes disponibles`, 'danger', 4000); }
      } catch (e) { toast(`Error preparando ${nombre}: ${(e as Error).message}`, 'danger'); }
      i++;
    }
    rec.ocupado = false; setProgreso(null);
    toast(rec.cancelar ? 'Preparación cancelada' : `Listo: ${ok} ${ok === 1 ? 'colección preparada' : 'colecciones preparadas'}${compartidas ? ` (${compartidas} descargadas de la red)` : ''}`, rec.cancelar ? '' : 'ok', 3500);
    setSeleccion(new Set()); actualizarEspacio();
  }
  const pendientesMias = enColeccion.filter(id => !rec.prepared.has(id) || rec.prepared.get(id)?.stale);

  return (
    <div className="panel" id="reconocimiento">
      <h3>Reconocimiento por cámara</h3>
      <p className="small muted">Para identificar cartas por imagen, la app descarga una vez las imágenes de cada colección y guarda una "huella" de cada carta en este dispositivo (unos segundos por colección, necesita internet). Prepara solo las colecciones que tienes. Sin este paso, la cámara solo puede leer el número impreso.</p>
      <div className="btn-group">
        <button className="btn primary sm" disabled={!cargado || !!progreso} onClick={() => preparar(pendientesMias.length ? pendientesMias : enColeccion)}>Preparar colecciones de mi colección ({pendientesMias.length ? `${pendientesMias.length} pendientes` : enColeccion.length})</button>
        <button className="btn sm" disabled={!cargado || !!progreso || !seleccion.size} onClick={() => preparar([...seleccion])}>Preparar seleccionadas{seleccion.size ? ` (${seleccion.size})` : ''}</button>
        <button className="btn sm danger" disabled={!cargado || !!progreso || !rec.prepared.size} onClick={() => setBorrar(true)}>Borrar huellas</button>
      </div>
      {progreso ? (
        <div style={{ marginTop: 10 }}>
          <div className="row"><div className="grow small">{progreso.msg}</div><button className="btn sm" onClick={() => { rec.cancelar = true; setProgreso(p => (p ? { ...p, msg: 'Cancelando…' } : p)); }}>Cancelar</button></div>
          <div className="progress" style={{ marginTop: 6 }}><div style={{ width: progreso.pct + '%' }} /></div>
        </div>
      ) : null}
      {rec.stale.length ? <div className="notice warn" style={{ marginTop: 10 }}><b>El reconocimiento por imagen cambió</b> y las huellas de {rec.stale.length} {rec.stale.length === 1 ? 'colección son' : 'colecciones son'} de una versión anterior: hay que volver a prepararlas. <button className="btn sm" onClick={() => preparar(rec.stale.slice())}>Volver a preparar</button></div> : null}
      <div className="small muted" style={{ margin: '10px 0 6px' }}>{cargado ? `Preparadas: ${rec.prepared.size} colecciones (${rec.cartasIndexadas.toLocaleString('es-PE')} cartas)${espacio ? ` · espacio usado: ${(espacio / 1048576).toFixed(1)} MB` : ''}` : 'Cargando huellas…'}</div>
      <div className="toggle">
        <div><div style={{ fontWeight: 600 }}>Leer el número impreso (OCR)</div><div className="small muted">{ocrSoportado ? 'Lee "025/165" en la parte inferior de la carta para reforzar la identificación (descarga 10 MB la primera vez).' : 'No disponible en este navegador.'}</div></div>
        <button className={`switch ${ocr ? 'on' : ''}`} aria-label="OCR" onClick={() => { const v = !ocr; setOcr(v); prefs.ocr = v; }} />
      </div>
      <div className="row wrap" style={{ margin: '8px 0' }}>
        <input className="input grow" placeholder="Filtrar colecciones…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        <div className="seg">{([['', 'Todas'], ['intl', 'Internacional'], ['ja', 'Japón']] as const).map(([v, l]) => <button key={v} className={region === v ? 'active' : ''} onClick={() => setRegion(v)}>{l}</button>)}</div>
      </div>
      <div className="set-list" style={{ maxHeight: 360, overflow: 'auto' }}>
        {lista.slice(0, 200).map(s => {
          const m = rec.prepared.get(s.id);
          const total = cat.cartasDe(s.id).filter(c => !c.sd).length;
          return (
            <label key={s.id} className={`set-item ${m && !m.stale ? 'done' : ''}`}>
              <input type="checkbox" checked={seleccion.has(s.id)} onChange={e => setSeleccion(sel => { const n = new Set(sel); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
              <SimboloSet setId={s.id} />
              <span className="name">{nombreColeccion(s, idioma, true)} <span className="faint">({total} cartas · {s.d ? s.d.slice(0, 4) : ''}){enColeccion.includes(s.id) ? ' · en tu colección' : ''}</span>
                {m ? (m.stale ? <small className="warn">Huellas de una versión anterior · <button className="link" onClick={e => { e.preventDefault(); preparar([s.id]); }}>volver a preparar</button></small> : <small>Preparada: {m.count} de {m.total} imágenes · <button className="link" onClick={e => { e.preventDefault(); rec.quitarColeccion(s.id).then(actualizarEspacio); }}>quitar</button></small>) : null}
              </span>
            </label>
          );
        })}
        {lista.length > 200 ? <div className="small muted" style={{ padding: 8 }}>Mostrando 200 de {lista.length}: usa el filtro.</div> : null}
      </div>
      {borrar ? <Confirmar titulo="Borrar huellas" texto="Se eliminarán las huellas visuales de todas las colecciones preparadas en este dispositivo. Podrás volver a prepararlas cuando quieras." okLabel="Borrar" peligro onOk={async () => { await rec.borrarTodo(); setBorrar(false); actualizarEspacio(); toast('Huellas borradas'); }} onClose={() => setBorrar(false)} /> : null}
    </div>
  );
}
