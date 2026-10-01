'use client';
import { Icono } from '../Icono';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { fold, nombreCarta, nombreColeccion } from '@/lib/catalogo';
import type { Casilla, Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { CardPicker } from '../CardPicker';
import { AddEntrySheet } from '../AddEntrySheet';
import { Sheet, Confirmar } from '../Sheet';
import { usePedirPrecios } from '../Precio';
import { useToast } from '../Toast';
import { Campo } from '../ui';

/** Álbum físico: páginas de bolsillos; cada bolsillo tiene (o no) una carta asignada. */
export function AlbumFisico({ id }: { id: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const toast = useToast();
  const router = useRouter();
  const album = col.albumes.find(a => a.id === id);
  const [casillas, setCasillas] = useState<Map<number, Casilla>>(new Map());
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<number | null>(null);   // bolsillo elegido para mover
  const [arrastre, setArrastre] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);          // bolsillo al que asignar
  const [menu, setMenu] = useState<number | null>(null);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [editar, setEditar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [rellenar, setRellenar] = useState(false);
  const idioma = perfil.idioma_nombres;

  const cargar = useCallback(async () => {
    if (!album) return;
    const lista = await col.casillasDe(album.id);
    setCasillas(new Map(lista.map(c => [c.indice, c])));
  }, [album, col]);
  useEffect(() => { cargar(); }, [cargar]);

  const porPagina = album ? album.columnas * album.filas : 0;
  const propias = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of col.entradas) if (e.carta_id) { const l = m.get(e.carta_id) || []; l.push(e); m.set(e.carta_id, l); }
    return m;
  }, [col.entradas]);
  const idsAsignadas = useMemo(() => [...casillas.values()].map(c => c.carta_id).filter((x): x is string => !!x), [casillas]);
  usePedirPrecios(idsAsignadas);
  const stats = useMemo(() => {
    let asignadas = 0, tengo = 0, valor = 0, falta = 0;
    for (const c of casillas.values()) {
      if (!c.carta_id) continue;
      asignadas++;
      const carta = cat.carta(c.carta_id);
      if (!carta || carta.sd) continue;
      const es = propias.get(c.carta_id);
      const d = precios.precioDefecto(carta, es?.[0]?.acabado || '');
      if (es && es.length) { tengo++; valor += d.pen; } else falta += d.pen;
    }
    return { asignadas, tengo, valor: Math.round(valor * 100) / 100, falta: Math.round(falta * 100) / 100 };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [casillas, propias, cat, precios.version]);

  if (!album) return <div className="empty">Ese álbum no existe. <Link href="/app/album">Volver</Link></div>;
  const totalPaginas = album.paginas;
  const inicio = (pagina - 1) * porPagina;

  async function asignar(indice: number, carta: Carta | null) {
    const ok = await col.guardarCasilla(album!.id, indice, carta ? carta.id : null, null);
    if (!ok) { toast('No se pudo guardar', 'danger'); return; }
    setCasillas(m => { const n = new Map(m); if (carta) n.set(indice, { album_id: album!.id, indice, carta_id: carta.id, entrada_id: null }); else n.delete(indice); return n; });
  }
  async function mover(de: number, a: number) {
    if (de === a) return;
    const ok = await col.moverCasilla(album!.id, de, a);
    if (!ok) { toast('No se pudo mover', 'danger'); return; }
    setCasillas(m => {
      const n = new Map(m); const o = m.get(de); const d = m.get(a);
      n.delete(de); n.delete(a);
      if (o) n.set(a, { ...o, indice: a });
      if (d) n.set(de, { ...d, indice: de });
      return n;
    });
  }
  async function rellenarCon(set: Coleccion, desde: number) {
    const cartas = cat.cartasDe(set.id);
    const total = album!.paginas * porPagina;
    let i = desde, n = 0;
    const nuevas = new Map(casillas);
    const filas: { album_id: string; indice: number; carta_id: string; entrada_id: null }[] = [];
    for (const c of cartas) {
      while (i < total && nuevas.has(i)) i++;
      if (i >= total) break;
      filas.push({ album_id: album!.id, indice: i, carta_id: c.id, entrada_id: null });
      nuevas.set(i, { album_id: album!.id, indice: i, carta_id: c.id, entrada_id: null });
      i++; n++;
    }
    for (let k = 0; k < filas.length; k += 200) {
      const lote = filas.slice(k, k + 200);
      // upsert por lotes
      const { supabaseBrowser } = await import('@/lib/supabase/client');
      const { error } = await supabaseBrowser().from('album_casillas').upsert(lote, { onConflict: 'album_id,indice' });
      if (error) { toast('Error al rellenar: ' + error.message, 'danger'); await cargar(); return; }
    }
    setCasillas(nuevas);
    toast(`${n} bolsillos rellenados con ${nombreColeccion(set, idioma)}${n < cartas.length ? ` (faltaron ${cartas.length - n} por espacio)` : ''}`, 'ok', 4000);
  }

  const casillaMenu = menu != null ? casillas.get(menu) : undefined;
  const cartaMenu = casillaMenu ? cat.carta(casillaMenu.carta_id) : undefined;

  return (
    <div>
      <p className="small"><Link href="/app/album">← Álbumes</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div><h2 style={{ margin: 0 }}>{album.nombre}</h2><div className="small muted">{album.paginas} páginas de {album.columnas} × {album.filas}{album.descripcion ? ` · ${album.descripcion}` : ''}</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setRellenar(true)}>Rellenar con una colección</button>
          <button className="btn sm" onClick={() => setEditar(true)}>Editar</button>
          <button className="btn sm danger" onClick={() => setBorrar(true)}>Eliminar</button>
        </div>
      </div>
      <div className="stat" style={{ margin: '10px 0' }}>
        <div className="box"><b>{stats.tengo} / {stats.asignadas}</b><span>cartas que tienes de las asignadas</span></div>
        <div className="box"><b>{fmtPen(stats.valor)}</b><span>precio de lo que tienes</span></div>
        <div className="box"><b>{fmtPen(stats.falta)}</b><span>para completar</span></div>
      </div>
      <div className="binder-toolbar">
        <button className="btn sm" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1} aria-label="Página anterior"><Icono n="izquierda" /></button>
        <select className="input sm" value={pagina} onChange={e => setPagina(parseInt(e.target.value, 10))}>{Array.from({ length: totalPaginas }, (_, i) => <option key={i + 1} value={i + 1}>Página {i + 1}</option>)}</select>
        <button className="btn sm" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} aria-label="Página siguiente"><Icono n="derecha" /></button>
        {seleccion != null ? <span className="chip warn">Moviendo el bolsillo {seleccion + 1}: toca el destino <button className="link" onClick={() => setSeleccion(null)}>cancelar</button></span> : <span className="small muted">Toca un bolsillo vacío para asignarle una carta; uno lleno para ver opciones. Arrastra para reordenar.</span>}
      </div>
      <div className="binder-page" style={{ gridTemplateColumns: `repeat(${album.columnas}, 1fr)` }}>
        {Array.from({ length: porPagina }, (_, k) => {
          const indice = inicio + k;
          const cas = casillas.get(indice);
          const carta = cas ? cat.carta(cas.carta_id) : undefined;
          const es = carta ? propias.get(carta.id) : undefined;
          const tengo = !!(es && es.length);
          const cls = `pocket ${carta ? (tengo ? 'filled' : 'missing') : ''} ${seleccion === indice ? 'selected' : ''} ${arrastre === indice ? 'drop' : ''}`;
          return (
            <div key={indice} className={cls} draggable={!!carta} title={carta ? nombreCarta(carta, idioma) : `Bolsillo ${indice + 1}`}
              onDragStart={e => { e.dataTransfer.setData('text/plain', String(indice)); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => { e.preventDefault(); setArrastre(indice); }}
              onDragLeave={() => setArrastre(a => (a === indice ? null : a))}
              onDrop={e => { e.preventDefault(); setArrastre(null); const de = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(de)) mover(de, indice); }}
              onClick={() => {
                if (seleccion != null) { mover(seleccion, indice); setSeleccion(null); return; }
                if (carta) setMenu(indice); else setPicker(indice);
              }}>
              <span className="pocket-n">{indice + 1}</span>
              {carta ? <><Thumb carta={carta} set={cat.setOf(carta)} idioma={tengo && es && es.length ? es[0].idioma : null} /><span className="pocket-have">{tengo ? `×${es!.reduce((n, e) => n + e.cantidad, 0)}` : 'falta'}</span><span className="pocket-name">{carta.l} · {nombreCarta(carta, idioma)}</span></> : <span className="pocket-plus">+</span>}
            </div>
          );
        })}
      </div>

      {picker != null ? <CardPicker titulo={`Bolsillo ${picker + 1}: elegir carta`} onPick={c => { const i = picker; setPicker(null); asignar(i, c); }} onClose={() => setPicker(null)} /> : null}
      {menu != null && casillaMenu ? (
        <Sheet titulo={`Bolsillo ${menu + 1}`} onClose={() => setMenu(null)}>
          {cartaMenu ? (
            <div className="card-row" style={{ cursor: 'default' }}>
              <Thumb carta={cartaMenu} set={cat.setOf(cartaMenu)} className="lg" />
              <div className="card-main">
                <div className="card-name">{nombreCarta(cartaMenu, idioma)}</div>
                <div className="card-set">{nombreColeccion(cat.setOf(cartaMenu), idioma)} <span className="num">{cartaMenu.l}</span></div>
                <div className="small" style={{ marginTop: 4 }}>{(propias.get(cartaMenu.id) || []).length ? (propias.get(cartaMenu.id) || []).map(e => <span key={e.id} style={{ marginRight: 6 }}><LocChip loc={ubicador.donde(e)} corto /></span>) : <span className="album-miss">No la tienes todavía</span>}</div>
              </div>
            </div>
          ) : null}
          <div className="stack" style={{ marginTop: 12 }}>
            {cartaMenu && !(propias.get(cartaMenu.id) || []).length ? <button className="btn primary" onClick={() => { setMenu(null); setAgregar(cartaMenu); }}>+ Ya la tengo: guardar en mi colección</button> : null}
            {cartaMenu ? <Link className="btn" href={`/app/carta/${encodeURIComponent(cartaMenu.id)}`}>Ver la carta</Link> : null}
            <button className="btn" onClick={() => { setSeleccion(menu); setMenu(null); }}>Mover a otro bolsillo</button>
            <button className="btn" onClick={() => { const i = menu; setMenu(null); setPicker(i); }}>Cambiar la carta de este bolsillo</button>
            <button className="btn danger" onClick={() => { const i = menu; setMenu(null); asignar(i, null); }}>Vaciar bolsillo</button>
          </div>
        </Sheet>
      ) : null}
      {agregar ? <AddEntrySheet carta={agregar} onClose={() => setAgregar(null)} /> : null}
      {rellenar ? <RellenarSheet desde={inicio} onClose={() => setRellenar(false)} onElegir={(s, desde) => { setRellenar(false); rellenarCon(s, desde); }} /> : null}
      {editar ? <EditorAlbum album={album} onClose={() => setEditar(false)} /> : null}
      {borrar ? <Confirmar titulo="Eliminar álbum" texto={`Se eliminará el álbum "${album.nombre}" y la asignación de sus bolsillos. Tus cartas no se borran de tu colección.`} okLabel="Eliminar" peligro onOk={async () => { const ok = await col.eliminarAlbum(album.id); if (ok) { toast('Álbum eliminado', 'ok'); router.replace('/app/album'); } }} onClose={() => setBorrar(false)} /> : null}
    </div>
  );
}

function RellenarSheet({ desde, onClose, onElegir }: { desde: number; onClose: () => void; onElegir: (s: Coleccion, desde: number) => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const [q, setQ] = useState('');
  const [desdeActual, setDesdeActual] = useState(true);
  const lista = useMemo(() => {
    const t = fold(q);
    return cat.sets.filter(s => !t || fold([s.n, s.ns, s.nj, s.ab, s.id, s.tid].filter(Boolean).join(' ')).includes(t)).sort((a, b) => (b.d || '').localeCompare(a.d || '')).slice(0, 40);
  }, [cat, q]);
  return (
    <Sheet titulo="Rellenar con una colección" onClose={onClose}>
      <p className="small muted">Asigna todas las cartas de una colección, en orden, a los bolsillos vacíos (sin tocar los que ya tienen carta).</p>
      <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={desdeActual} onChange={e => setDesdeActual(e.target.checked)} /><span>Empezar en la página actual (si no, desde la primera)</span></label>
      <input className="input" placeholder="Buscar colección…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <div className="set-list" style={{ marginTop: 8, maxHeight: '50vh', overflow: 'auto' }}>
        {lista.map(s => <div key={s.id} className="set-item" role="button" tabIndex={0} onClick={() => onElegir(s, desdeActual ? desde : 0)}><div className="name">{nombreColeccion(s, perfil.idioma_nombres, true)}<small> · {cat.cartasDe(s.id).length} cartas · {s.d}</small></div></div>)}
      </div>
    </Sheet>
  );
}

function EditorAlbum({ album, onClose }: { album: { id: string; nombre: string; descripcion: string; paginas: number; columnas: number; filas: number }; onClose: () => void }) {
  const col = useColeccion();
  const toast = useToast();
  const [nombre, setNombre] = useState(album.nombre); const [descripcion, setDescripcion] = useState(album.descripcion);
  const [paginas, setPaginas] = useState(album.paginas); const [columnas, setColumnas] = useState(album.columnas); const [filas, setFilas] = useState(album.filas);
  return (
    <Sheet titulo="Editar álbum" onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => { const ok = await col.editarAlbum(album.id, { nombre: nombre.trim() || album.nombre, descripcion, paginas, columnas, filas }); if (ok) { toast('Álbum guardado', 'ok'); onClose(); } }}>Guardar</button></>}>
      <Campo label="Nombre">{id => <input id={id} className="input" value={nombre} onChange={e => setNombre(e.target.value)} />}</Campo>
      <Campo label="Descripción">{id => <input id={id} className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} />}</Campo>
      <div className="row wrap">
        <Campo label="Páginas">{id => <input id={id} className="input" type="number" min={1} max={300} value={paginas} onChange={e => setPaginas(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))} />}</Campo>
        <Campo label="Columnas">{id => <input id={id} className="input" type="number" min={1} max={6} value={columnas} onChange={e => setColumnas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
        <Campo label="Filas">{id => <input id={id} className="input" type="number" min={1} max={6} value={filas} onChange={e => setFilas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
      </div>
      <p className="small muted">Si reduces el tamaño, los bolsillos que queden fuera conservan su asignación pero no se muestran.</p>
    </Sheet>
  );
}
