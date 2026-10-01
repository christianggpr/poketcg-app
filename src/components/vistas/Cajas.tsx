'use client';
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
import { Campo } from '../ui';
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
    if (!cajaDestino) { toast('Crea una caja primero', 'danger'); return; }
    setOcupado(e.id);
    const ok = await col.editarEntrada(e.id, { caja_id: cajaDestino });
    setOcupado(null);
    if (!ok) { toast('No se pudo colocar', 'danger'); return; }
    setColocadaId(e.id);
  }
  return (
    <div className="panel" style={{ marginTop: 12 }} data-testid="por-colocar">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>📥 Por colocar <span className="muted">({totalCartas(entradas)})</span></h3>
        {cajas.length ? <label className="small row" style={{ gap: 6, alignItems: 'center' }}>Colocar en <select className="input" style={{ width: 'auto', minHeight: 34, padding: '5px 10px', fontSize: 13 }} value={cajaDestino} onChange={e => setDestino(e.target.value)} data-testid="select-caja-colocar">{cajas.map(c => <option key={c.id} value={c.id}>📦 {c.nombre}</option>)}</select></label> : null}
      </div>
      <p className="small muted">Cartas que todavía no tienen caja: las que compraste en el mercado llegan aquí. Elige la caja y pulsa «Colocar»: la app te dice en qué posición va.</p>
      {!cajas.length ? <p className="notice warn small">Crea una caja para poder colocarlas.</p> : null}
      <div className="card-list">
        {lista.map(e => { const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; return (
          <div key={e.id} className="card-row" style={{ cursor: 'default' }} data-testid="carta-por-colocar">
            <span onClick={() => setDetalle(e)} role="button" style={{ cursor: 'pointer' }}><Thumb carta={c} set={set} /></span>
            <div className="card-main">
              <div className="card-name">{e.cantidad > 1 ? `${e.cantidad}× ` : ''}{nombreEntrada(cat, e, perfil.idioma_nombres)}</div>
              <div className="card-set">{coleccionEntrada(cat, e, perfil.idioma_nombres)} <span className="num">{numeroEntrada(cat, e)}</span>{e.idioma ? <span className="pill">{e.idioma}</span> : null}{e.acabado ? <span className="pill">{e.acabado}</span> : null}{e.condicion ? <span className="pill">{e.condicion}</span> : null}</div>
              {e.compra_orden_id ? <div className="small muted">🛒 {e.nota || 'Comprada en el mercado'}</div> : e.nota ? <div className="small muted">{e.nota}</div> : null}
            </div>
            <div className="card-side"><button className="btn sm primary" disabled={!cajas.length || ocupado === e.id} onClick={() => colocar(e)} data-testid="btn-colocar">{ocupado === e.id ? '…' : 'Colocar'}</button><button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => setDetalle(e)}>Editar</button></div>
          </div>
        ); })}
      </div>
      {detalle ? <EntryDetailSheet entrada={detalle} onClose={() => setDetalle(null)} /> : null}
      {colocada ? (
        <Sheet titulo="¡Colocada!" onClose={() => setColocadaId(null)} pie={<button className="btn primary" onClick={() => setColocadaId(null)} data-testid="btn-colocada-listo">Listo</button>}>
          <div data-testid="colocacion"><Colocacion entrada={colocada} loc={ubicador.ubicacion(colocada)} /></div>
        </Sheet>
      ) : null}
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
      if (ok) { toast('Caja guardada', 'ok'); onClose({ ...caja, nombre, descripcion, modo, orden_colecciones: ordenCol }); } else toast('No se pudo guardar', 'danger');
    } else {
      const c = await col.crearCaja({ nombre, descripcion, modo, orden_colecciones: ordenCol });
      setGuardando(false);
      if (c) { toast('Caja creada', 'ok'); setCreada(c); } else toast('No se pudo crear la caja', 'danger');
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
      <Sheet titulo="Caja creada" onClose={() => onClose(creada)} pie={<button className="btn block" onClick={() => onClose(creada)}>Cerrar</button>}>
        <p style={{ margin: 0 }}>📦 <b>{creada.nombre}</b> ya está lista para guardar cartas.</p>
        <PreguntaVenta ocupado={guardando}
          detalle="«Sí, todas»: cada carta que guardes en esta caja se publicará sola con el precio por defecto (el mayor entre el piso y el valor de mercado). «Elegir cuáles»: te lo preguntaremos carta por carta. Podrás cambiar precios, pausar o retirar cuando quieras; los compradores solo ven tu nombre de usuario."
          onTodas={() => responder({ en_venta: true }, 'Caja en venta: lo que guardes aquí se publicará solo')}
          onElegir={() => responder({}, 'Te preguntaremos carta por carta')}
          onNo={() => responder({ preguntar_venta: false }, 'Esta caja no se sube a la nube. Puedes activar "Caja en venta" cuando quieras')} />
      </Sheet>
    );
  }
  return (
    <Sheet titulo={caja ? 'Editar caja' : 'Nueva caja'} onClose={() => onClose()} pie={<><button className="btn" onClick={() => onClose()}>Cancelar</button><button className="btn primary" onClick={guardar} disabled={guardando}>{caja ? 'Guardar' : 'Crear caja'}</button></>}>
      <Campo label="Nombre (la identificación que usas)" ayuda="Ej.: Caja 1, Caja A, Roja…">{id => <input id={id} className="input" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} />}</Campo>
      <Campo label="Descripción (opcional)">{id => <input id={id} className="input" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="dónde está, qué guarda…" />}</Campo>
      <div className="field"><label>Cómo ordenas esta caja</label>
        <div className="stack">
          <label className="check"><input type="radio" name="modo" checked={modo === 'auto'} onChange={() => setModo('auto')} /><span><b>Por colección y número</b> (recomendado): la app calcula sola la posición de cada carta.</span></label>
          <label className="check"><input type="radio" name="modo" checked={modo === 'manual'} onChange={() => setModo('manual')} /><span><b>Orden manual</b>: tú asignas el número de posición a cada carta.</span></label>
        </div>
      </div>
      {modo === 'auto' ? <div className="field"><label>Orden de las colecciones dentro de la caja</label>
        <div className="seg"><button className={ordenCol === 'asc' ? 'active' : ''} onClick={() => setOrdenCol('asc')}>Antiguas primero</button><button className={ordenCol === 'desc' ? 'active' : ''} onClick={() => setOrdenCol('desc')}>Nuevas primero</button></div>
      </div> : null}
    </Sheet>
  );
}

export function Cajas() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const [editor, setEditor] = useState<{ abierto: boolean; caja?: Caja | null }>({ abierto: false });
  const cajas = cajasOrdenadas(col.cajas);
  const resumen = useMemo(() => {
    const m = new Map<string, { n: number; sets: Map<string, number> }>();
    for (const e of col.entradas) {
      if (!e.caja_id) continue;
      let r = m.get(e.caja_id); if (!r) { r = { n: 0, sets: new Map() }; m.set(e.caja_id, r); }
      r.n += e.cantidad;
      const nombre = coleccionEntrada(cat, e, perfil.idioma_nombres);
      r.sets.set(nombre, (r.sets.get(nombre) || 0) + e.cantidad);
    }
    return m;
  }, [col.entradas, cat, perfil.idioma_nombres]);
  const sinCaja = col.entradas.filter(e => !e.caja_id);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>Cajas</h2>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/app/ventas" className="btn sm">🏷️ Mis ventas{col.publicaciones.length ? ` (${col.publicaciones.length})` : ''}</Link>
          <button className="btn primary sm" onClick={() => setEditor({ abierto: true, caja: null })}>+ Nueva caja</button>
        </div>
      </div>
      <p className="small muted">El orden de las cajas es el orden físico de izquierda a derecha. Usa ◀ ▶ para moverlas. Total: {totalCartas(col.entradas).toLocaleString('es-PE')} cartas.</p>
      {!cajas.length ? <div className="empty"><div className="big">📦</div><p><b>Aún no tienes cajas.</b></p><p className="muted">Crea tus cajas con la identificación que usas (Caja 1, Caja A, Roja…). Luego, al guardar una carta, la app te dirá en qué posición va.</p></div> : null}
      <div className="box-grid">
        {cajas.map((c, i) => {
          const r = resumen.get(c.id);
          const sets = r ? [...r.sets.entries()].sort((a, b) => b[1] - a[1]) : [];
          return (
            <div className="box-card" key={c.id}>
              <Link href={`/app/bulk/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="order">{i + 1}ª</div>
                <div className="box-name"><span className="ico">📦</span>{c.nombre}</div>
                <div className="box-meta">{r ? `${r.n} ${r.n === 1 ? 'carta' : 'cartas'}` : 'vacía'} · {c.modo === 'manual' ? 'orden manual' : 'por colección y nº'}{c.descripcion ? ` · ${c.descripcion}` : ''}{c.en_venta ? <> · <span className="pill ok">🏷️ en venta</span></> : null}</div>
                {sets.length ? <div className="box-sets">{sets.slice(0, 4).map(([n, q]) => <span className="chip" key={n}>{n} · {q}</span>)}{sets.length > 4 ? <span className="chip">+{sets.length - 4}</span> : null}</div> : null}
              </Link>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button className="btn sm ghost" onClick={() => col.moverCaja(c.id, -1)} disabled={i === 0} title="Mover a la izquierda">◀</button>
                <button className="btn sm ghost" onClick={() => col.moverCaja(c.id, 1)} disabled={i === cajas.length - 1} title="Mover a la derecha">▶</button>
                <span className="grow" />
                <button className="btn sm ghost" onClick={() => setEditor({ abierto: true, caja: c })}>Editar</button>
              </div>
            </div>
          );
        })}
      </div>
      {sinCaja.length ? <PorColocar entradas={sinCaja} /> : null}
      {editor.abierto ? <EditorCaja caja={editor.caja} onClose={() => setEditor({ abierto: false })} /> : null}
    </div>
  );
}

export function CajaDetalle({ id }: { id: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const caja = col.cajas.find(c => c.id === id);
  const [editar, setEditar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
  const [elegir, setElegir] = useState(params.get('elegir') === '1');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (params.get('elegir') === '1') setElegir(true); }, [params]);
  const [picker, setPicker] = useState(false);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [formPersonalizada, setFormPersonalizada] = useState(false);
  const [personalizada, setPersonalizada] = useState<Personalizada | null>(null);
  const [editarEntrada, setEditarEntrada] = useState<Entrada | null>(null);
  const [pNombre, setPNombre] = useState(''); const [pCol, setPCol] = useState(''); const [pNum, setPNum] = useState('');
  if (!caja) return <div className="empty"><div className="big">📦</div>Esa caja no existe. <Link href="/app/bulk">Volver a Bulk</Link></div>;
  const pos = ubicador.posiciones(caja);
  const idioma = perfil.idioma_nombres;
  const entradasCaja = pos.lista.map(p => p.entrada);
  const publicables = entradasCaja.filter(e => { const c = cat.carta(e.carta_id); return c && !c.sd; });
  const pubsCaja = entradasCaja.map(e => col.publicacionDe(e.id)).filter((p): p is NonNullable<typeof p> => !!p);
  const selPublicar = [...sel].filter(id => !col.publicacionDe(id) && publicables.some(e => e.id === id));
  const selRetirar = [...sel].map(id => col.publicacionDe(id)).filter((p): p is NonNullable<typeof p> => !!p);
  async function cambiarVenta(v: boolean) {
    setOcupado(true);
    // los precios de mercado se descargan antes para que el precio por defecto no quede en el piso
    if (v) await precios.pedir([...new Set(publicables.map(e => e.carta_id!))]).catch(() => {});
    const ok = await col.editarCaja(caja!.id, { en_venta: v, preguntar_venta: false });
    setOcupado(false);
    if (!ok) { toast('No se pudo cambiar', 'danger'); return; }
    if (v) toast('Caja en venta: sus cartas están publicadas y las nuevas se publicarán solas', 'ok', 3500);
    else toast('Las cartas nuevas de esta caja ya no se publicarán solas. Las publicaciones actuales siguen en venta (puedes retirarlas desde Mis ventas).', '', 4500);
  }
  async function publicarSeleccion() {
    setOcupado(true);
    await precios.pedir([...new Set(selPublicar.map(id => entradasCaja.find(e => e.id === id)?.carta_id).filter((x): x is string => !!x))]).catch(() => {});
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
  function alternar(id: string) { setSel(x => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y; }); }
  let seccionPrev = '';
  return (
    <div>
      <p className="small"><Link href="/app/bulk">← Bulk</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div><h2 style={{ margin: 0 }}>📦 {caja.nombre}</h2><div className="small muted">Caja {ubicador.ordinal(caja)}ª de izquierda a derecha · {pos.total} {pos.total === 1 ? 'posición' : 'posiciones'} · {caja.modo === 'manual' ? 'orden manual' : `por colección y nº (${caja.orden_colecciones === 'desc' ? 'nuevas primero' : 'antiguas primero'})`}{caja.descripcion ? ` · ${caja.descripcion}` : ''}{pubsCaja.length ? ` · ${pubsCaja.length} en el mercado` : ''}</div></div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn primary sm" onClick={() => setPicker(true)}>+ Añadir carta</button>
          <button className="btn sm" onClick={() => setEditar(true)}>Editar</button>
          <button className="btn sm danger" onClick={() => setBorrar(true)}>Eliminar</button>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <label className="row" style={{ alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <button className={`switch ${caja.en_venta ? 'on' : ''}`} role="switch" aria-checked={caja.en_venta} aria-label="Caja en venta" disabled={ocupado} data-testid="switch-venta" onClick={() => { if (caja.en_venta) cambiarVenta(false); else setConfirmarVenta(true); }} />
          <span><b>Caja en venta</b> <span className="small muted">{caja.en_venta ? '· cada carta que guardes aquí se publica sola' : '· sus cartas solo se publican si tú lo eliges'}</span></span>
        </label>
        <span className="grow" />
        {!elegir && publicables.length ? <button className="btn sm" onClick={() => setElegir(true)}>☑️ Elegir cuáles vender</button> : null}
        <Link href="/app/ventas" className="btn sm ghost">🏷️ Mis ventas</Link>
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
      <div className="entry-list" style={{ marginTop: 12 }}>
        {pos.lista.map(p => {
          const e = p.entrada;
          const c = cat.carta(e.carta_id);
          const set = c ? cat.setOf(c) : undefined;
          const cabecera = p.seccion !== seccionPrev ? <div className="set-header">{p.seccion}</div> : null;
          seccionPrev = p.seccion;
          const pub = col.publicacionDe(e.id);
          const seleccionable = elegir && !!c && !c.sd;
          return (
            <div key={e.id}>
              {cabecera}
              <div className={`entry-row ${seleccionable ? 'seleccionable' : ''}`} role="button" tabIndex={0} onClick={() => { if (elegir) { if (seleccionable) alternar(e.id); } else setEditarEntrada(e); }}>
                {elegir ? <input type="checkbox" className="sel" checked={sel.has(e.id)} disabled={!seleccionable} readOnly aria-label="Seleccionar" /> : null}
                <div className="posnum">{p.idx}</div>
                <Thumb carta={c} set={set} />
                <div className="card-main">
                  <div className="card-name" style={{ fontSize: 14 }}>{nombreEntrada(cat, e, idioma)}</div>
                  <div className="card-set"><span className="num">{c ? `${c.l}${set?.cc ? '/' + set.cc : ''}` : numeroEntrada(cat, e)}</span>{e.acabado ? <span className="pill">{e.acabado}</span> : null}{e.idioma ? <span className="pill">{e.idioma}</span> : null}<EstadoPub pub={pub} />{e.nota ? <span className="faint"> · {e.nota}</span> : null}</div>
                </div>
                <div className="card-side"><span className="qty">×{e.cantidad}</span><Precio carta={c} acabado={e.acabado} cantidad={e.cantidad} /></div>
              </div>
            </div>
          );
        })}
        {!pos.total ? <div className="empty"><div className="big">🫙</div>Esta caja está vacía. Pulsa "Añadir carta".</div> : null}
      </div>
      {picker ? <CardPicker onPick={c => { setPicker(false); setAgregar(c); }} onClose={() => setPicker(false)} onPersonalizada={() => { setPicker(false); setFormPersonalizada(true); }} /> : null}
      {agregar ? <AddEntrySheet carta={agregar} cajaInicial={caja.id} onClose={() => setAgregar(null)} /> : null}
      {formPersonalizada ? (
        <Sheet titulo="Carta personalizada" onClose={() => setFormPersonalizada(false)} pie={<><button className="btn" onClick={() => setFormPersonalizada(false)}>Cancelar</button><button className="btn primary" disabled={!pNombre.trim()} onClick={() => { setFormPersonalizada(false); setPersonalizada({ nombre: pNombre.trim(), coleccion: pCol.trim(), numero: pNum.trim() }); }}>Continuar</button></>}>
          <p className="small muted">Para cartas que no están en el catálogo (promos raras, otras regiones).</p>
          <Campo label="Nombre">{id => <input id={id} className="input" autoFocus value={pNombre} onChange={e => setPNombre(e.target.value)} />}</Campo>
          <div className="row wrap"><Campo label="Colección">{id => <input id={id} className="input" value={pCol} onChange={e => setPCol(e.target.value)} />}</Campo><Campo label="Número">{id => <input id={id} className="input" value={pNum} onChange={e => setPNum(e.target.value)} />}</Campo></div>
        </Sheet>
      ) : null}
      {personalizada ? <AddEntrySheet personalizada={personalizada} cajaInicial={caja.id} onClose={() => setPersonalizada(null)} /> : null}
      {editarEntrada ? <EntryDetailSheet entrada={editarEntrada} onClose={() => setEditarEntrada(null)} /> : null}
      {editar ? <EditorCaja caja={caja} onClose={() => setEditar(false)} /> : null}
      {confirmarVenta ? <Confirmar titulo="Poner la caja en venta" texto={`Se publicarán en el mercado las ${publicables.length - pubsCaja.length} ${publicables.length - pubsCaja.length === 1 ? 'carta' : 'cartas'} del catálogo que hay en esta caja con el precio por defecto (${fmtPen(precios.ajustes.pisos.normal)} las normales, ${fmtPen(precios.ajustes.pisos.especial)} las holo/reverse/especiales, o el valor de mercado si es mayor) y cada carta que guardes aquí se publicará sola. Podrás cambiar precios, pausar o retirar cuando quieras. Las de más de S/ 50 quedan pausadas hasta que les agregues una foto.`} okLabel="Poner en venta" onOk={() => { setConfirmarVenta(false); cambiarVenta(true); }} onClose={() => setConfirmarVenta(false)} /> : null}
      {borrar ? <Confirmar titulo="Eliminar caja" texto={`Se eliminará la caja "${caja.nombre}". Las cartas que tenga quedarán sin caja (no se borran).`} okLabel="Eliminar caja" peligro onOk={async () => { const ok = await col.eliminarCaja(caja.id, false); if (ok) { toast('Caja eliminada', 'ok'); router.replace('/app/bulk'); } }} onClose={() => setBorrar(false)} /> : null}
    </div>
  );
}
