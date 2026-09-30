'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Carta } from '@/lib/catalogo';
import { cajasOrdenadas, coleccionEntrada, nombreEntrada, numeroEntrada, totalCartas, type Caja, type Entrada, type Personalizada } from '@/lib/coleccion';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
import { Sheet, Confirmar } from '../Sheet';
import { useToast } from '../Toast';
import { Campo } from '../ui';
import { Thumb } from '../Thumb';
import { Precio } from '../Precio';
import { CardPicker } from '../CardPicker';
import { AddEntrySheet } from '../AddEntrySheet';
import { EntryDetailSheet } from '../EntryDetailSheet';

export function EditorCaja({ caja, onClose }: { caja?: Caja | null; onClose: (guardada?: Caja) => void }) {
  const col = useColeccion();
  const toast = useToast();
  const [nombre, setNombre] = useState(caja?.nombre || '');
  const [descripcion, setDescripcion] = useState(caja?.descripcion || '');
  const [modo, setModo] = useState<'auto' | 'manual'>(caja?.modo || 'auto');
  const [ordenCol, setOrdenCol] = useState<'asc' | 'desc'>(caja?.orden_colecciones || 'asc');
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    if (caja) {
      const ok = await col.editarCaja(caja.id, { nombre: nombre.trim() || caja.nombre, descripcion, modo, orden_colecciones: ordenCol });
      setGuardando(false);
      if (ok) { toast('Caja guardada', 'ok'); onClose({ ...caja, nombre, descripcion, modo, orden_colecciones: ordenCol }); } else toast('No se pudo guardar', 'danger');
    } else {
      const c = await col.crearCaja({ nombre, descripcion, modo, orden_colecciones: ordenCol });
      setGuardando(false);
      if (c) { toast('Caja creada', 'ok'); onClose(c); } else toast('No se pudo crear la caja', 'danger');
    }
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
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Cajas</h2>
        <button className="btn primary sm" onClick={() => setEditor({ abierto: true, caja: null })}>+ Nueva caja</button>
      </div>
      <p className="small muted">El orden de las cajas es el orden físico de izquierda a derecha. Usa ◀ ▶ para moverlas. Total: {totalCartas(col.entradas).toLocaleString('es-PE')} cartas.</p>
      {!cajas.length ? <div className="empty"><div className="big">📦</div><p><b>Aún no tienes cajas.</b></p><p className="muted">Crea tus cajas con la identificación que usas (Caja 1, Caja A, Roja…). Luego, al guardar una carta, la app te dirá en qué posición va.</p></div> : null}
      <div className="box-grid">
        {cajas.map((c, i) => {
          const r = resumen.get(c.id);
          const sets = r ? [...r.sets.entries()].sort((a, b) => b[1] - a[1]) : [];
          return (
            <div className="box-card" key={c.id}>
              <Link href={`/app/cajas/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="order">{i + 1}ª</div>
                <div className="box-name"><span className="ico">📦</span>{c.nombre}</div>
                <div className="box-meta">{r ? `${r.n} ${r.n === 1 ? 'carta' : 'cartas'}` : 'vacía'} · {c.modo === 'manual' ? 'orden manual' : 'por colección y nº'}{c.descripcion ? ` · ${c.descripcion}` : ''}</div>
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
      {sinCaja.length ? <p className="notice warn small" style={{ marginTop: 12 }}>{sinCaja.length} {sinCaja.length === 1 ? 'carta no tiene' : 'cartas no tienen'} caja asignada (aparecen en Buscar → Mi colección; ábrelas para asignarles una caja).</p> : null}
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
  const ubicador = useUbicador();
  const caja = col.cajas.find(c => c.id === id);
  const [editar, setEditar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [picker, setPicker] = useState(false);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [formPersonalizada, setFormPersonalizada] = useState(false);
  const [personalizada, setPersonalizada] = useState<Personalizada | null>(null);
  const [editarEntrada, setEditarEntrada] = useState<Entrada | null>(null);
  const [pNombre, setPNombre] = useState(''); const [pCol, setPCol] = useState(''); const [pNum, setPNum] = useState('');
  if (!caja) return <div className="empty"><div className="big">📦</div>Esa caja no existe. <Link href="/app/cajas">Volver a cajas</Link></div>;
  const pos = ubicador.posiciones(caja);
  const idioma = perfil.idioma_nombres;
  let seccionPrev = '';
  return (
    <div>
      <p className="small"><Link href="/app/cajas">← Cajas</Link></p>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div><h2 style={{ margin: 0 }}>📦 {caja.nombre}</h2><div className="small muted">Caja {ubicador.ordinal(caja)}ª de izquierda a derecha · {pos.total} {pos.total === 1 ? 'posición' : 'posiciones'} · {caja.modo === 'manual' ? 'orden manual' : `por colección y nº (${caja.orden_colecciones === 'desc' ? 'nuevas primero' : 'antiguas primero'})`}{caja.descripcion ? ` · ${caja.descripcion}` : ''}</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn primary sm" onClick={() => setPicker(true)}>+ Añadir carta</button>
          <button className="btn sm" onClick={() => setEditar(true)}>Editar</button>
          <button className="btn sm danger" onClick={() => setBorrar(true)}>Eliminar</button>
        </div>
      </div>
      <div className="entry-list" style={{ marginTop: 12 }}>
        {pos.lista.map(p => {
          const e = p.entrada;
          const c = cat.carta(e.carta_id);
          const set = c ? cat.setOf(c) : undefined;
          const cabecera = p.seccion !== seccionPrev ? <div className="set-header">{p.seccion}</div> : null;
          seccionPrev = p.seccion;
          return (
            <div key={e.id}>
              {cabecera}
              <div className="entry-row" role="button" tabIndex={0} onClick={() => setEditarEntrada(e)}>
                <div className="posnum">{p.idx}</div>
                <Thumb carta={c} set={set} />
                <div className="card-main">
                  <div className="card-name" style={{ fontSize: 14 }}>{nombreEntrada(cat, e, idioma)}</div>
                  <div className="card-set"><span className="num">{c ? `${c.l}${set?.cc ? '/' + set.cc : ''}` : numeroEntrada(cat, e)}</span>{e.acabado ? <span className="pill">{e.acabado}</span> : null}{e.idioma ? <span className="pill">{e.idioma}</span> : null}{e.nota ? <span className="faint"> · {e.nota}</span> : null}</div>
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
      {borrar ? <Confirmar titulo="Eliminar caja" texto={`Se eliminará la caja "${caja.nombre}". Las cartas que tenga quedarán sin caja (no se borran).`} okLabel="Eliminar caja" peligro onOk={async () => { const ok = await col.eliminarCaja(caja.id, false); if (ok) { toast('Caja eliminada', 'ok'); router.replace('/app/cajas'); } }} onClose={() => setBorrar(false)} /> : null}
    </div>
  );
}
