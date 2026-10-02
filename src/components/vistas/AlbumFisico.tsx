'use client';
import { Icono } from '../Icono';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { fold, nombreCarta, nombreColeccion } from '@/lib/catalogo';
import type { Album, Casilla, Entrada } from '@/lib/coleccion';
import { marcaAgua } from '@/lib/portadas';
import { EditorAlbumPropio } from '../EditorAlbumPropio';
import { Libro, type AccionLibro } from '../Libro';
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

/**
 * Álbum personalizado (bolsillos). Mejoras 4 · B: usa el mismo libro que los álbumes de colección (hoja oscura, cuadrícula
 * elegible, 1 o 2 páginas, flechas a los costados, + discreto en los bolsillos vacíos), con arrastrar para reordenar y el
 * menú de opciones de cada bolsillo lleno. Fila compacta: "tengo / asignadas · precio · faltan S/ X".
 */
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
  const [modo, setModo] = useState<'todos' | 'tengo' | 'faltan'>('todos');
  const idioma = perfil.idioma_nombres;

  const cargar = useCallback(async () => {
    if (!album) return;
    const lista = await col.casillasDe(album.id);
    setCasillas(new Map(lista.map(c => [c.indice, c])));
  }, [album, col]);
  useEffect(() => { cargar(); }, [cargar]);

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
  const totalBolsillos = album ? album.paginas * album.columnas * album.filas : 0;
  // bolsillos (índices) que se muestran según el filtro
  const items = useMemo(() => {
    const todos = Array.from({ length: totalBolsillos }, (_, i) => i);
    if (modo === 'todos') return todos;
    return todos.filter(i => { const c = casillas.get(i); if (!c?.carta_id) return false; const tiene = !!propias.get(c.carta_id)?.length; return modo === 'tengo' ? tiene : !tiene; });
  }, [totalBolsillos, modo, casillas, propias]);
  useEffect(() => { setPagina(1); }, [modo]);

  if (!album) return <div className="empty">Ese álbum no existe. <Link href="/app/album">Volver</Link></div>;
  const porPaginaFisica = album.columnas * album.filas;

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
    const total = totalBolsillos;
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
  // primer bolsillo visible de la página actual del libro (para "Rellenar desde la página actual")
  const inicioVisible = items.length ? items[Math.min(items.length - 1, (pagina - 1) * porPaginaFisica)] : 0;

  const celda = (indice: number) => {
    const cas = casillas.get(indice);
    const carta = cas ? cat.carta(cas.carta_id) : undefined;
    const es = carta ? propias.get(carta.id) : undefined;
    const tengo = !!(es && es.length);
    const cls = `pocket album-cell ${carta ? (tengo ? 'filled' : 'missing') : 'vacio'} ${seleccion === indice ? 'selected' : ''} ${arrastre === indice ? 'drop' : ''}`;
    const titulo = carta ? `${indice + 1} · ${nombreCarta(carta, idioma)}${tengo ? ` · tienes ${es!.reduce((n, e) => n + e.cantidad, 0)}` : ' · te falta'}` : `Bolsillo ${indice + 1}: toca para asignarle una carta`;
    return (
      <>
        <div className={cls} draggable={!!carta} title={titulo} role="button" tabIndex={0} data-testid={carta ? (tengo ? 'bolsillo-tengo' : 'bolsillo-falta') : 'bolsillo-vacio'} data-indice={indice}
          onDragStart={e => { e.dataTransfer.setData('text/plain', String(indice)); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={e => { e.preventDefault(); setArrastre(indice); }}
          onDragLeave={() => setArrastre(a => (a === indice ? null : a))}
          onDrop={e => { e.preventDefault(); setArrastre(null); const de = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(de)) mover(de, indice); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLDivElement).click(); }}
          onClick={() => {
            if (seleccion != null) { mover(seleccion, indice); setSeleccion(null); return; }
            if (carta) setMenu(indice); else setPicker(indice);
          }}>
          {carta ? <Thumb carta={carta} set={cat.setOf(carta)} idioma={tengo && es && es.length ? es[0].idioma : null} alt={nombreCarta(carta, idioma)} /> : null}
          <span className="pocket-n">{indice + 1}</span>
          {carta && tengo ? <span className="casilla-cant bulk" title="Copias que tienes">×{es!.reduce((n, e) => n + e.cantidad, 0)}</span> : null}
          {carta && !tengo ? <span className="casilla-falta"><span className="casilla-sin">Falta</span></span> : null}
        </div>
        {!carta ? <button type="button" className="mas-rapido" aria-label={`Asignar una carta al bolsillo ${indice + 1}`} title="Asignar una carta" onClick={() => { if (seleccion != null) { mover(seleccion, indice); setSeleccion(null); } else setPicker(indice); }}
          onDragOver={e => { e.preventDefault(); setArrastre(indice); }} onDrop={e => { e.preventDefault(); setArrastre(null); const de = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(de)) mover(de, indice); }}
          data-testid="btn-mas-bolsillo"><Icono n="mas" tam={20} grosor={2.75} /></button> : null}
      </>
    );
  };
  const acciones: AccionLibro[] = [
    { texto: 'Rellenar con una colección', icono: 'album', onClick: () => setRellenar(true), testid: 'btn-rellenar-album', primaria: true },
    { texto: 'Editar álbum', icono: 'lapiz', onClick: () => setEditar(true), testid: 'btn-editar-album' },
    { texto: 'Eliminar álbum', icono: 'basura', onClick: () => setBorrar(true), testid: 'btn-eliminar-album' }
  ];
  const filtros = (
    <div className="seg filtro-album" data-testid="filtro-album">
      <button type="button" className={modo === 'todos' ? 'active' : ''} onClick={() => setModo('todos')}>Todos</button>
      <button type="button" className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {stats.tengo}</button>
      <button type="button" className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {stats.asignadas - stats.tengo}</button>
    </div>
  );
  return (
    <div className="album-detalle">
      <Libro<number>
        items={items} clave={i => String(i)} celda={celda} cuadriculaId={`p-${album.id}`} cuadriculaPropia={{ cols: album.columnas, filas: album.filas }}
        miga={{ href: '/app/album', texto: 'Mis álbumes' }}
        titulo={<>{album.nombre}<span className="pill warn" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Propio</span></>}
        resumen={<span data-testid="progreso-album"><b>{stats.tengo} / {stats.asignadas}</b> · <b>{fmtPen(stats.valor)}</b> · <span className="muted">faltan {fmtPen(stats.falta)}</span></span>}
        filtros={filtros} acciones={acciones} nombreUnidad="bolsillos"
        ayuda="Toca un bolsillo vacío (o su +) para asignarle una carta; uno lleno abre sus opciones. En PC puedes arrastrar una carta a otro bolsillo."
        vacio={modo === 'faltan' ? 'No te falta ninguna de las asignadas.' : modo === 'tengo' ? 'Todavía no tienes ninguna de las cartas asignadas.' : 'Este álbum no tiene bolsillos.'}
        pagina={pagina} onPagina={setPagina}
        antes={seleccion != null ? <div className="notice info small" style={{ marginBottom: 8 }}>Moviendo el bolsillo {seleccion + 1}: toca el destino. <button className="link" onClick={() => setSeleccion(null)}>Cancelar</button></div> : null}
      />
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
      {rellenar ? <RellenarSheet desde={inicioVisible} onClose={() => setRellenar(false)} onElegir={(s, desde) => { setRellenar(false); rellenarCon(s, desde); }} /> : null}
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

/** Mejoras 3 · A: editar un álbum personalizado con el mismo editor que al crearlo (portada, color, marca de agua, tamaño). */
function EditorAlbum({ album, onClose }: { album: Album; onClose: () => void }) {
  const col = useColeccion();
  const toast = useToast();
  return (
    <EditorAlbumPropio titulo="Editar álbum" okLabel="Guardar" inicial={{ nombre: album.nombre, descripcion: album.descripcion, paginas: album.paginas, columnas: album.columnas, filas: album.filas, color: album.color || undefined, marca_agua: marcaAgua(album.marca_agua) }} onClose={onClose}
      onGuardar={async d => { const ok = await col.editarAlbum(album.id, d); if (ok) toast('Álbum guardado', 'ok'); return ok; }} />
  );
}
