'use client';
import { useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA } from '@/lib/config';
import { cajasOrdenadas, type Entrada } from '@/lib/coleccion';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';
import { useUbicador } from './useUbicador';
import { Sheet, Confirmar } from './Sheet';
import { Thumb } from './Thumb';
import { Colocacion } from './Ubicacion';
import { Precio } from './Precio';
import { useToast } from './Toast';
import { Campo } from './ui';
import { EstadoPub, PublicarSheet } from './PublicarSheet';

/** Detalle de una carta física: editar cantidad/acabado/idioma, mover de caja, eliminar. */
export function EntryDetailSheet({ entrada, onClose }: { entrada: Entrada; onClose: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const toast = useToast();
  const carta = cat.carta(entrada.carta_id);
  const set = carta ? cat.setOf(carta) : undefined;
  const [d, setD] = useState({ cantidad: entrada.cantidad, acabado: entrada.acabado, idioma: entrada.idioma, condicion: entrada.condicion, nota: entrada.nota, caja_id: entrada.caja_id, posicion: entrada.posicion });
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [vender, setVender] = useState(false);
  const actual = col.entradas.find(e => e.id === entrada.id) || entrada;
  const loc = ubicador.ubicacion(actual);
  const caja = col.cajas.find(c => c.id === actual.caja_id);
  const pub = col.publicacionDe(actual.id);

  async function guardar() {
    setGuardando(true);
    const ok = await col.editarEntrada(entrada.id, { cantidad: Math.max(1, d.cantidad), acabado: d.acabado, idioma: d.idioma, condicion: d.condicion, nota: d.nota, caja_id: d.caja_id, posicion: d.posicion });
    setGuardando(false);
    if (ok) { toast('Guardado', 'ok'); onClose(); } else toast('No se pudo guardar', 'danger');
  }
  async function eliminar() {
    const ok = await col.eliminarEntrada(entrada.id);
    if (ok) { toast('Carta eliminada de tu colección', 'ok'); onClose(); } else toast('No se pudo eliminar', 'danger');
  }

  return (
    <>
      <Sheet titulo="Carta de tu colección" onClose={onClose} pie={<><button className="btn danger" onClick={() => setConfirmar(true)}>Eliminar</button><span className="grow" /><button className="btn" onClick={onClose}>Cerrar</button><button className="btn primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button></>}>
        <div className="card-row" style={{ cursor: 'default' }}>
          <Thumb carta={carta} set={set} className="lg" />
          <div className="card-main">
            <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : actual.personalizada?.nombre}</div>
            <div className="card-set">{carta ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(carta, set)}</span></> : <>{actual.personalizada?.coleccion} <span className="num">{actual.personalizada?.numero}</span></>}</div>
            {carta ? <div className="small" style={{ marginTop: 4 }}><Precio carta={carta} acabado={actual.acabado} cantidad={actual.cantidad} corto={false} /> · <Link href={`/app/carta/${encodeURIComponent(carta.id)}`} onClick={onClose}>ver carta</Link></div> : null}
          </div>
        </div>
        <Colocacion entrada={actual} loc={loc} compacta />
        {carta && !carta.sd ? (
          <div className={`notice ${pub ? (pub.estado === 'activa' ? 'ok' : 'warn') : 'info'} small`} style={{ marginTop: 10 }} data-testid="mercado-entrada">
            {pub ? <><EstadoPub pub={pub} /> {pub.cantidad} {pub.cantidad === 1 ? 'copia' : 'copias'} · {pub.tipo_precio === 'manual' ? 'precio manual' : 'precio por defecto'}{pub.estado === 'pausada' && pub.motivo_pausa === 'foto' ? ' · falta la foto (precio mayor a S/ 50)' : ''} </> : <>No está en venta. </>}
            <button className={`btn sm ${pub ? '' : 'primary'}`} style={{ marginLeft: 4 }} onClick={() => setVender(true)}>{pub ? 'Ver o editar publicación' : '🏷️ Vender en el mercado'}</button>
          </div>
        ) : null}
        <div className="row wrap" style={{ marginTop: 12 }}>
          <div className="field"><label>Cantidad</label><div className="stepper"><button onClick={() => setD(x => ({ ...x, cantidad: Math.max(1, x.cantidad - 1) }))}>−</button><input type="number" min={1} value={d.cantidad} onChange={e => setD(x => ({ ...x, cantidad: Math.max(1, parseInt(e.target.value, 10) || 1) }))} /><button onClick={() => setD(x => ({ ...x, cantidad: x.cantidad + 1 }))}>+</button></div></div>
          <Campo label="Acabado">{id => <select id={id} className="input" value={d.acabado} onChange={e => setD(x => ({ ...x, acabado: e.target.value }))}>{ACABADOS.map(a => <option key={a} value={a}>{a || '—'}</option>)}</select>}</Campo>
          <Campo label="Idioma">{id => <select id={id} className="input" value={d.idioma} onChange={e => setD(x => ({ ...x, idioma: e.target.value }))}><option value="">—</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>}</Campo>
        </div>
        <div className="row wrap">
          <Campo label="Estado">{id => <select id={id} className="input" value={d.condicion} onChange={e => setD(x => ({ ...x, condicion: e.target.value }))}>{CONDICIONES.map(c => <option key={c} value={c}>{c ? ETIQUETA_CONDICION[c] || c : '—'}</option>)}</select>}</Campo>
          <div className="field grow"><label>Nota</label><input className="input" value={d.nota} onChange={e => setD(x => ({ ...x, nota: e.target.value }))} /></div>
        </div>
        <div className="row wrap">
          <Campo label="Caja">{id => <select id={id} className="input" value={d.caja_id || ''} onChange={e => setD(x => ({ ...x, caja_id: e.target.value || null }))}><option value="">Sin caja</option>{cajasOrdenadas(col.cajas).map(c => <option key={c.id} value={c.id}>📦 {c.nombre}</option>)}</select>}</Campo>
          {caja && caja.modo === 'manual' ? <div className="field"><label>Posición (orden manual)</label><input className="input" type="number" min={1} value={d.posicion || ''} onChange={e => setD(x => ({ ...x, posicion: parseInt(e.target.value, 10) || null }))} /></div> : null}
        </div>
      </Sheet>
      {confirmar ? <Confirmar titulo="Eliminar carta" texto={`Se quitará de tu colección (${actual.cantidad} ${actual.cantidad === 1 ? 'unidad' : 'unidades'})${pub ? ' y su publicación en el mercado se retirará' : ''}. Esta acción no se puede deshacer.`} okLabel="Eliminar" peligro onOk={eliminar} onClose={() => setConfirmar(false)} /> : null}
      {vender ? <PublicarSheet entrada={actual} onClose={() => setVender(false)} /> : null}
    </>
  );
}
