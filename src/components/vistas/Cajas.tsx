'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Carta } from '@/lib/catalogo';
import { cajasOrdenadas, coleccionEntrada, nombreEntrada, numeroEntrada, totalCartas, type Caja, type Entrada, type Personalizada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
import { Sheet, Confirmar } from '../Sheet';
import { useToast } from '../Toast';
import { Campo, useEsPC } from '../ui';
import { Thumb } from '../Thumb';
import { Precio } from '../Precio';
import { usePrecios } from '../PreciosProvider';
import { CardPicker } from '../CardPicker';
import { AddEntrySheet } from '../AddEntrySheet';
import { EntryDetailSheet } from '../EntryDetailSheet';
import { EstadoPub, PreguntaVenta } from '../PublicarSheet';
import { Colocacion } from '../Ubicacion';

/** Cartas sin caja ("por colocar"): las compradas en el mercado llegan aquí; se eligen caja y la app dice la posición. */
function PorColocar({ entradas }: { entradas: Entrada[] }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const ubicador = useUbicador();
  const cajas = cajasOrdenadas(col.cajas);
  const [destino, setDestino] = useState<string>('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Entrada | null>(null);
  const [colocadaId, setColocadaId] = useState<string | null>(null);
  const cajaDestino = destino || col.ultimaCajaId || cajas[0]?.id || '';
  const colocada = colocadaId ? col.entradas.find(e => e.id === colocadaId) || null : null;
  const lista = [...entradas].sort((a, b) => (b.compra_orden_id ? 1 : 0) - (a.compra_orden_id ? 1 : 0) || b.creado_en.localeCompare(a.creado_en));

  async function colocar(e: Entrada) {
    if (!cajaDestino) { toast('Crea un Bulk primero', 'danger'); return; }
    setOcupado(e.id);
    const ok = await col.editarEntrada(e.id, { caja_id: cajaDestino });
    setOcupado(null);
    if (!ok) { toast('No se pudo colocar', 'danger'); return; }
    setColocadaId(e.id);
  }
  const hoja = colocada ? (
    <Sheet titulo="¡Colocada!" onClose={() => setColocadaId(null)} pie={<button className="btn primary" onClick={() => setColocadaId(null)} data-testid="btn-colocada-listo">Listo</button>}>
      <div data-testid="colocacion"><Colocacion entrada={colocada} loc={ubicador.donde(colocada)} /></div>
    </Sheet>
  ) : null;
  if (!entradas.length) return hoja;   // sin cartas por colocar solo queda (si acaso) la hoja "¡Colocada!"
  return (
    <div className="panel" style={{ marginTop: 12 }} data-testid="por-colocar">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}><Icono n="entrada" /> Por colocar <span className="muted">({totalCartas(entradas)})</span></h3>
        {cajas.length ? <label className="small row" style={{ gap: 6, alignItems: 'center' }}>Colocar en <select className="input" style={{ width: 'auto', minHeight: 34, padding: '5px 10px', fontSize: 13 }} value={cajaDestino} onChange={e => setDestino(e.target.value)} data-testid="select-caja-colocar">{cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label> : null}
      </div>
      <p className="small muted">Cartas que todavía no tienen lugar. Elige el Bulk y pulsa «Colocar»: la app te dice en qué posición va. Las que compraste en el mercado también aparecen en Álbumes → Recibidas, con una sugerencia de álbum.</p>
      {!cajas.length ? <p className="notice warn small">Crea un Bulk para poder colocarlas.</p> : null}
      <div className="card-list">
        {lista.map(e => { const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; return (
          <div key={e.id} className="card-row" style={{ cursor: 'default' }} data-testid="carta-por-colocar">
            <span onClick={() => setDetalle(e)} role="button" style={{ cursor: 'pointer' }}><Thumb carta={c} set={set} /></span>
            <div className="card-main">
              <div className="card-name">{e.cantidad > 1 ? `${e.cantidad}× ` : ''}{nombreEntrada(cat, e, perfil.idioma_nombres)}</div>
              <div className="card-set">{coleccionEntrada(cat, e, perfil.idioma_nombres)} <span className="num">{numeroEntrada(cat, e)}</span>{e.idioma ? <span className="pill">{e.idioma}</span> : null}{e.acabado ? <span className="pill">{e.acabado}</span> : null}{e.condicion ? <span className="pill">{e.condicion}</span> : null}</div>
              {e.compra_orden_id ? <div className="small muted"><Icono n="carrito" tam={14} /> {e.nota || 'Comprada en el mercado'}</div> : e.nota ? <div className="small muted">{e.nota}</div> : null}
            </div>
            <div className="card-side"><button className="btn sm primary" disabled={!cajas.length || ocupado === e.id} onClick={() => colocar(e)} data-testid="btn-colocar">{ocupado === e.id ? '…' : 'Colocar'}</button><button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => setDetalle(e)}>Editar</button></div>
          </div>
        ); })}
      </div>
      {detalle ? <EntryDetailSheet entrada={detalle} onClose={() => setDetalle(null)} /> : null}
      {hoja}
    </div>
  );
}

export function EditorCaja({ caja, onClose }: { caja?: Caja | null; onClose: (guardada?: Caja) => void }) {
  const col = useColeccion();
  const toast = useToast();
  const [nombre, setNombre] = useState(caja?.nombre || '');
  const [descripcion, setDescripcion] = useState(caja?.descripcion || '');
  const [modo, setModo] = useState<'auto' | 'manual'>(caja?.modo || 'auto');
  const [ordenCol, setOrdenCol] = useState<'asc' | 'desc'>(caja?.orden_colecciones || 'asc');
  const [guardando, setGuardando] = useState(false);
  const [creada, setCreada] = useState<Caja | null>(null);
  async function guardar() {
    setGuardando(true);
    if (caja) {
      const ok = await col.editarCaja(caja.id, { nombre: nombre.trim() || caja.nombre, descripcion, modo, orden_colecciones: ordenCol });
      setGuardando(false);
      if (ok) { toast('Bulk guardado', 'ok'); onClose({ ...caja, nombre, descripcion, modo, orden_colecciones: ordenCol }); } else toast('No se pudo guardar', 'danger');
    } else {
      const c = await col.crearCaja({ nombre, descripcion, modo, orden_colecciones: ordenCol });
      setGuardando(false);
      if (c) { toast('Bulk creado', 'ok'); setCreada(c); } else toast('No se pudo crear el Bulk', 'danger');
    }
  }
  if (creada) {
    // Fase 2: al crear la caja se pregunta si sus cartas se suben a la nube para venderlas
    const responder = async (d: { en_venta?: boolean; preguntar_venta?: boolean }, aviso: string) => {
      setGuardando(true);
      const ok = Object.keys(d).length ? await col.editarCaja(creada.id, d) : true;
      setGuardando(false);
      if (ok) toast(aviso, 'ok', 3500);
      onClose({ ...creada, ...d });
    };
    return (
      <Sheet titulo="Bulk creado" onClose={() => onClose(creada)} pie={<button className="btn block" onClick={() => onClose(creada)}>Cerrar</button>}>
        <p style={{ margin: 0 }}><b>{creada.nombre}</b> ya está lista para guardar cartas.</p>
        <PreguntaVenta ocupado={guardando}
          detalle="«Sí, todas»: cada carta que guardes en este Bulk se publicará sola con el precio por defecto (el mayor entre el piso y el precio de mercado). «Elegir cuáles»: te lo preguntaremos carta por carta. Podrás cambiar precios, pausar o retirar cuando quieras; los compradores solo ven tu nombre de usuario."
          onTodas={() => responder({ en_venta: true }, 'Bulk en venta: lo que guardes aquí se publicará solo')}
          onElegir={() => responder({}, 'Te preguntaremos carta por carta')}
          onNo={() => responder({ preguntar_venta: false }, 'Este Bulk no se sube a la nube. Puedes activar "Bulk en venta" cuando quieras')} />
      </Sheet>
    );
  }
  return (
    <Sheet titulo={caja ? 'Editar Bulk' : 'Nuevo Bulk'} onClose={() => onClose()} pie={<><button className="btn" onClick={() => onClose()}>Cancelar</button><button className="btn primary" onClick={guardar} disabled={guardando}>{caja ? 'Guardar' : 'Crear Bulk'}</button></>}>
      <Campo label="Nombre (la identificación que usas)" ayuda="Ej.: Caja 1, Caja A, Roja…">{id => <input id={id} className="input" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} />}</Campo>
      <Campo label="Descripción (opcional)">{id => <input id={id} className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="dónde está, qué guarda…" />}</Campo>
      <div className="field"><label>Cómo ordenas este Bulk</label>
        <div className="stack">
          <label className="check"><input type="radio" name="modo" checked={modo === 'auto'} onChange={() => setModo('auto')} /><span><b>Por colección y número</b> (recomendado): la app calcula sola la posición de cada carta.</span></label>
          <label className="check"><input type="radio" name="modo" checked={modo === 'manual'} onChange={() => setModo('manual')} /><span><b>Orden manual</b>: tú asignas el número de posición a cada carta.</span></label>
        </div>
      </div>
      {modo === 'auto' ? <div className="field"><label>Orden de las colecciones dentro del Bulk</label>
        <div className="seg"><button className={ordenCol === 'asc' ? 'active' : ''} onClick={() => setOrdenCol('asc')}>Antiguas primero</button><button className={ordenCol === 'desc' ? 'active' : ''} onClick={() => setOrdenCol('desc')}>Nuevas primero</button></div>
      </div> : null}
    </Sheet>
  );
}

/** Pantalla Bulk (layout v2): selector de Bulks arriba, tarjeta del Bulk con precio e interruptor de venta, buscador y lista (celular) o tabla (PC). */
export function Cajas() { return <BulkVista />; }
export function CajaDetalle({ id }: { id: string }) { return <BulkVista id={id} />; }

function BulkVista({ id }: { id?: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const esPC = useEsPC();
  const cajas = cajasOrdenadas(col.cajas);
  // el Bulk activo cambia sin navegar (misma pantalla): la URL se actualiza con history.pushState
  const [idActivo, setIdActivo] = useState<string | null>(id || null);
  const caja = (idActivo ? col.cajas.find(c => c.id === idActivo) : null) || (id ? col.cajas.find(c => c.id === id) : null) || (!id ? (col.cajas.find(c => c.id === col.ultimaCajaId) || cajas[0]) : null) || null;
  const elegirBulk = (c: Caja) => { setIdActivo(c.id); try { window.history.pushState(null, '', `/app/bulk/${c.id}`); } catch { /* sin historial */ } };
  const [editor, setEditor] = useState<{ abierto: boolean; caja?: Caja | null }>({ abierto: false });
  const [borrar, setBorrar] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
  const [elegir, setElegir] = useState(params.get('elegir') === '1');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { if (params.get('elegir') === '1') setElegir(true); }, [params]);
  useEffect(() => { setQ(''); setSel(new Set()); }, [caja?.id]);
  const [picker, setPicker] = useState(false);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [formPersonalizada, setFormPersonalizada] = useState(false);
  const [personalizada, setPersonalizada] = useState<Personalizada | null>(null);
  const [editarEntrada, setEditarEntrada] = useState<Entrada | null>(null);
  const [pNombre, setPNombre] = useState(''); const [pCol, setPCol] = useState(''); const [pNum, setPNum] = useState('');
  const idioma = perfil.idioma_nombres;
  const conteo = useMemo(() => { const m = new Map<string, number>(); for (const e of col.entradas) if (e.caja_id) m.set(e.caja_id, (m.get(e.caja_id) || 0) + e.cantidad); return m; }, [col.entradas]);
  const enBolsillo = new Set(col.casillas.filter(c => c.entrada_id).map(c => c.entrada_id as string));
  const sinCaja = col.entradas.filter(e => !e.caja_id && !e.album_coleccion && !enBolsillo.has(e.id));   // sin lugar: ni Bulk, ni álbum, ni bolsillo

  if (id && !caja && !idActivo) return <div className="empty"><div className="big"><Icono n="bulk" tam={44} grosor={1.5} /></div>Ese Bulk no existe. <Link href="/app/bulk">Volver a Bulk</Link></div>;
  const pos = caja ? ubicador.posiciones(caja) : null;
  const entradasCaja = pos ? pos.lista.map(p => p.entrada) : [];
  const publicables = entradasCaja.filter(e => { const c = cat.carta(e.carta_id); return c && !c.sd; });
  const pubsCaja = entradasCaja.map(e => col.publicacionDe(e.id)).filter((p): p is NonNullable<typeof p> => !!p);
  const selPublicar = [...sel].filter(x => !col.publicacionDe(x) && publicables.some(e => e.id === x));
  const selRetirar = [...sel].map(x => col.publicacionDe(x)).filter((p): p is NonNullable<typeof p> => !!p);
  const precioBulk = entradasCaja.reduce((t, e) => { const c = cat.carta(e.carta_id); return c && !c.sd ? t + precios.precioDefecto(c, e.acabado).pen * e.cantidad : t; }, 0);
  const qn = q.trim().toLowerCase();
  const filtradas = pos ? pos.lista.filter(p => { if (!qn) return true; const e = p.entrada; const c = cat.carta(e.carta_id); return [nombreEntrada(cat, e, idioma), c?.n, c?.ns, c?.nj, coleccionEntrada(cat, e, idioma), numeroEntrada(cat, e), String(p.idx), e.nota].filter(Boolean).join(' ').toLowerCase().includes(qn); }) : [];
  // rangos de posiciones por sección (colección): "151 · posiciones 35–39"
  const secciones: { nombre: string; desde: number; hasta: number; filas: typeof filtradas }[] = [];
  for (const p of filtradas) { const u = secciones[secciones.length - 1]; if (u && u.nombre === p.seccion) { u.hasta = p.idx; u.filas.push(p); } else secciones.push({ nombre: p.seccion, desde: p.idx, hasta: p.idx, filas: [p] }); }

  async function cambiarVenta(v: boolean) {
    if (!caja) return;
    setOcupado(true);
    // los precios de mercado se descargan antes para que el precio por defecto no quede en el piso
    if (v) await precios.pedir([...new Set(publicables.map(e => e.carta_id!))]).catch(() => {});
    const ok = await col.editarCaja(caja.id, { en_venta: v, preguntar_venta: false });
    setOcupado(false);
    if (!ok) { toast('No se pudo cambiar', 'danger'); return; }
    if (v) toast('Bulk en venta: sus cartas están publicadas y las nuevas se publicarán solas', 'ok', 3500);
    else toast('Las cartas nuevas de este Bulk ya no se publicarán solas. Las publicaciones actuales siguen en venta (puedes retirarlas desde Mis ventas).', '', 4500);
  }
  async function publicarSeleccion() {
    setOcupado(true);
    await precios.pedir([...new Set(selPublicar.map(x => entradasCaja.find(e => e.id === x)?.carta_id).filter((x): x is string => !!x))]).catch(() => {});
    const n = await col.publicarVarias(selPublicar);
    setOcupado(false);
    if (n) { toast(`${n} ${n === 1 ? 'carta publicada' : 'cartas publicadas'} con el precio por defecto`, 'ok', 3500); setSel(new Set()); setElegir(false); }
    else toast('No se publicó ninguna carta', 'danger');
  }
  async function retirarSeleccion() {
    setOcupado(true);
    const n = await col.cambiarEstado(selRetirar.map(p => p.id), 'retirada');
    setOcupado(false);
    if (n) { toast(`${n} ${n === 1 ? 'publicación retirada' : 'publicaciones retiradas'}`, 'ok'); setSel(new Set()); }
  }
  function alternar(x: string) { setSel(y => { const z = new Set(y); if (z.has(x)) z.delete(x); else z.add(x); return z; }); }
  const abrirFila = (e: Entrada, seleccionable: boolean) => { if (elegir) { if (seleccionable) alternar(e.id); } else setEditarEntrada(e); };
  const ordenTxt = caja ? (caja.modo === 'manual' ? 'Orden manual' : `Ordenado por colección y número${caja.orden_colecciones === 'desc' ? ' (nuevas primero)' : ''}`) : '';
  const i = caja ? cajas.findIndex(c => c.id === caja.id) : -1;

  return (
    <div className="bulk-vista">
      <div className="cabecera-seccion">
        <h1 style={{ margin: 0 }}>Bulk</h1>
        <div className="acciones"><button className="btn primary sm" onClick={() => setEditor({ abierto: true, caja: null })} data-testid="btn-nuevo-bulk">+ Nuevo Bulk</button></div>
      </div>
      <PorColocar entradas={sinCaja} />
      {!cajas.length ? <div className="empty"><div className="big"><Icono n="bulk" tam={44} grosor={1.5} /></div><p><b>Aún no tienes Bulks.</b></p><p className="muted">Un Bulk es una caja o fila donde guardas cartas en orden. Créalos con la identificación que usas (Bulk 1, Bulk A, Rojo…); luego, al guardar una carta, la app te dirá en qué posición va.</p></div> : null}
      {cajas.length ? (
        <div className="selector-bulk" role="tablist" aria-label="Bulks" data-testid="selector-bulk">
          {cajas.map(c => { const n = conteo.get(c.id) || 0; return (
            <a key={c.id} href={`/app/bulk/${c.id}`} onClick={e => { e.preventDefault(); elegirBulk(c); }} className={`box-card ${caja?.id === c.id ? 'active' : ''}`} role="tab" aria-selected={caja?.id === c.id} data-testid="bulk-selector">
              <span className="box-name">{c.nombre}</span>
              <span className="box-meta">{n} {n === 1 ? 'carta' : 'cartas'}{c.en_venta ? ' · en venta' : ''}</span>
            </a>
          ); })}
        </div>
      ) : null}
      {caja && pos ? (
        <>
          <div className="panel tarjeta-bulk" data-testid="tarjeta-bulk">
            <div className="grow">
              <h2 style={{ margin: 0 }}>{caja.nombre}</h2>
              <div className="small muted">{ordenTxt} · <b data-testid="precio-bulk">{fmtPen(precioBulk)}</b>{caja.descripcion ? ` · ${caja.descripcion}` : ''}{pubsCaja.length ? ` · ${pubsCaja.length} en el mercado` : ''}</div>
            </div>
            <label className={`check grande venta-bulk ${caja.en_venta ? 'activo' : ''}`} style={{ cursor: 'pointer' }}>
              <button className={`switch ${caja.en_venta ? 'on' : ''}`} role="switch" aria-checked={caja.en_venta} aria-label="Bulk en venta" disabled={ocupado} data-testid="switch-venta" onClick={() => { if (caja.en_venta) cambiarVenta(false); else setConfirmarVenta(true); }} />
              <span><b>Bulk en venta</b><span className="small muted solo-pc"> · {caja.en_venta ? 'cada carta que guardes aquí se publica sola' : 'sus cartas solo se publican si tú lo eliges'}</span></span>
            </label>
            <div className="buscar-bulk">
              <span className="ico"><Icono n="buscar" tam={18} /></span>
              <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar en ${caja.nombre}`} aria-label={`Buscar en ${caja.nombre}`} data-testid="buscar-bulk" />
            </div>
            <div className="acciones-bulk">
              <button className="btn primary" onClick={() => setPicker(true)} data-testid="btn-agregar-bulk"><Icono n="mas" /> Agregar cartas</button>
              <button className="btn sm icon" onClick={() => col.moverCaja(caja.id, -1)} disabled={i <= 0} title="Mover a la izquierda" aria-label="Mover a la izquierda"><Icono n="izquierda" /></button>
              <button className="btn sm icon" onClick={() => col.moverCaja(caja.id, 1)} disabled={i < 0 || i === cajas.length - 1} title="Mover a la derecha" aria-label="Mover a la derecha"><Icono n="derecha" /></button>
              <button className="btn sm" onClick={() => setEditor({ abierto: true, caja })}>Editar</button>
              {!elegir && publicables.length ? <button className="btn sm" onClick={() => setElegir(true)}><Icono n="ok" /> Elegir cuáles vender</button> : null}
              <button className="btn sm danger" onClick={() => setBorrar(true)}>Eliminar</button>
            </div>
          </div>
          {elegir ? (
            <div className="barra-seleccion" data-testid="barra-seleccion">
              <span className="small"><b>{sel.size}</b> {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
              <button className="btn sm ghost" onClick={() => setSel(new Set(publicables.map(e => e.id)))}>Todas</button>
              <button className="btn sm ghost" onClick={() => setSel(new Set())}>Ninguna</button>
              <span className="grow" />
              {selRetirar.length ? <button className="btn sm danger" disabled={ocupado} onClick={retirarSeleccion}>Retirar {selRetirar.length}</button> : null}
              <button className="btn sm primary" disabled={ocupado || !selPublicar.length} onClick={publicarSeleccion}>Publicar {selPublicar.length || ''}</button>
              <button className="btn sm" onClick={() => { setElegir(false); setSel(new Set()); }}>Cancelar</button>
            </div>
          ) : null}
          {!pos.total ? <div className="empty"><div className="big"><Icono n="bulk" tam={44} grosor={1.5} /></div>Este Bulk está vacío. Pulsa «Agregar cartas».</div> : null}
          {pos.total && !filtradas.length ? <div className="empty">Ninguna carta coincide con «{q}».</div> : null}
          {esPC && filtradas.length ? (
            <div className="tabla-scroll"><table className="tabla bulk-tabla" data-testid="bulk-tabla">
              <thead><tr>{elegir ? <th /> : null}<th>Posición</th><th>Carta</th><th>Colección</th><th>N.º</th><th>Idioma</th><th>Estado</th><th>Cant.</th><th>Precio</th><th>Mercado</th></tr></thead>
              <tbody>
                {filtradas.map(p => { const e = p.entrada; const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; const pub = col.publicacionDe(e.id); const seleccionable = elegir && !!c && !c.sd; return (
                  <tr key={e.id} className={`fila-bulk ${seleccionable ? 'seleccionable' : ''} ${sel.has(e.id) ? 'sel' : ''}`} onClick={() => abrirFila(e, seleccionable)} tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter') abrirFila(e, seleccionable); }}>
                    {elegir ? <td><input type="checkbox" className="sel" checked={sel.has(e.id)} disabled={!seleccionable} readOnly aria-label="Seleccionar" /></td> : null}
                    <td><span className="posicion">#{p.idx}</span></td>
                    <td><span className="carta-celda"><Thumb carta={c} set={set} /><b>{nombreEntrada(cat, e, idioma)}</b></span></td>
                    <td>{coleccionEntrada(cat, e, idioma)}</td>
                    <td className="num">{c ? c.l : numeroEntrada(cat, e)}</td>
                    <td>{e.idioma || '—'}</td>
                    <td>{e.condicion || '—'}{e.acabado ? <span className="muted"> · {e.acabado}</span> : null}</td>
                    <td><b>×{e.cantidad}</b></td>
                    <td><Precio carta={c} acabado={e.acabado} cantidad={e.cantidad} /></td>
                    <td><EstadoPub pub={pub} conPrecio={false} /></td>
                  </tr>
                ); })}
              </tbody>
            </table></div>
          ) : null}
          {!esPC && filtradas.length ? (
            <div className="entry-list" style={{ marginTop: 12 }}>
              {secciones.map(sec => (
                <div key={sec.nombre + sec.desde}>
                  <div className="set-header">{sec.nombre} · {sec.desde === sec.hasta ? `posición ${sec.desde}` : `posiciones ${sec.desde}–${sec.hasta}`}</div>
                  {sec.filas.map(p => { const e = p.entrada; const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; const pub = col.publicacionDe(e.id); const seleccionable = elegir && !!c && !c.sd; return (
                    <div key={e.id} className={`entry-row ${seleccionable ? 'seleccionable' : ''}`} role="button" tabIndex={0} onClick={() => abrirFila(e, seleccionable)} onKeyDown={ev => { if (ev.key === 'Enter') abrirFila(e, seleccionable); }}>
                      {elegir ? <input type="checkbox" className="sel" checked={sel.has(e.id)} disabled={!seleccionable} readOnly aria-label="Seleccionar" /> : null}
                      <div className="posnum">#{p.idx}</div>
                      <Thumb carta={c} set={set} />
                      <div className="card-main">
                        <div className="card-name" style={{ fontSize: 14 }}>{nombreEntrada(cat, e, idioma)}</div>
                        <div className="card-set"><span className="num">{c ? `${c.l}${set?.cc ? '/' + set.cc : ''}` : numeroEntrada(cat, e)}</span>{e.idioma ? <span>· {e.idioma}</span> : null}{e.condicion ? <span>· {e.condicion}</span> : null}{e.acabado ? <span className="pill">{e.acabado}</span> : null}<EstadoPub pub={pub} />{e.nota ? <span className="faint"> · {e.nota}</span> : null}</div>
                      </div>
                      <div className="card-side"><span className="qty">×{e.cantidad}</span><Precio carta={c} acabado={e.acabado} cantidad={e.cantidad} /></div>
                    </div>
                  ); })}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {picker ? <CardPicker onPick={c => { setPicker(false); setAgregar(c); }} onClose={() => setPicker(false)} onPersonalizada={() => { setPicker(false); setFormPersonalizada(true); }} /> : null}
      {agregar && caja ? <AddEntrySheet carta={agregar} cajaInicial={caja.id} onClose={() => setAgregar(null)} /> : null}
      {formPersonalizada ? (
        <Sheet titulo="Carta personalizada" onClose={() => setFormPersonalizada(false)} pie={<><button className="btn" onClick={() => setFormPersonalizada(false)}>Cancelar</button><button className="btn primary" disabled={!pNombre.trim()} onClick={() => { setFormPersonalizada(false); setPersonalizada({ nombre: pNombre.trim(), coleccion: pCol.trim(), numero: pNum.trim() }); }}>Continuar</button></>}>
          <p className="small muted">Para cartas que no están en el catálogo (promos raras, otras regiones).</p>
          <Campo label="Nombre">{id => <input id={id} className="input" autoFocus value={pNombre} onChange={e => setPNombre(e.target.value)} />}</Campo>
          <div className="row wrap"><Campo label="Colección">{id => <input id={id} className="input" value={pCol} onChange={e => setPCol(e.target.value)} />}</Campo><Campo label="Número">{id => <input id={id} className="input" value={pNum} onChange={e => setPNum(e.target.value)} />}</Campo></div>
        </Sheet>
      ) : null}
      {personalizada && caja ? <AddEntrySheet personalizada={personalizada} cajaInicial={caja.id} onClose={() => setPersonalizada(null)} /> : null}
      {editarEntrada ? <EntryDetailSheet entrada={editarEntrada} onClose={() => setEditarEntrada(null)} /> : null}
      {editor.abierto ? <EditorCaja caja={editor.caja} onClose={g => { setEditor({ abierto: false }); if (g && !editor.caja) elegirBulk(g); }} /> : null}
      {confirmarVenta && caja ? <Confirmar titulo="Poner el Bulk en venta" texto={`Se publicarán en el mercado las ${publicables.length - pubsCaja.length} ${publicables.length - pubsCaja.length === 1 ? 'carta' : 'cartas'} del catálogo que hay en este Bulk con el precio por defecto (${fmtPen(precios.ajustes.pisos.normal)} las normales, ${fmtPen(precios.ajustes.pisos.especial)} las holo/reverse/especiales, o el precio de mercado si es mayor) y cada carta que guardes aquí se publicará sola. Podrás cambiar precios, pausar o retirar cuando quieras. Las de más de S/ 50 quedan pausadas hasta que les agregues una foto.`} okLabel="Poner en venta" onOk={() => { setConfirmarVenta(false); cambiarVenta(true); }} onClose={() => setConfirmarVenta(false)} /> : null}
      {borrar && caja ? <Confirmar titulo="Eliminar Bulk" texto={`Se eliminará el Bulk "${caja.nombre}". Las cartas que tenga quedarán sin ubicación (no se borran).`} okLabel="Eliminar Bulk" peligro onOk={async () => { const ok = await col.eliminarCaja(caja.id, false); if (ok) { toast('Bulk eliminado', 'ok'); router.replace('/app/bulk'); } }} onClose={() => setBorrar(false)} /> : null}
    </div>
  );
}
