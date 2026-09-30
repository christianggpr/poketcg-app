'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import type { Entrada, Publicacion } from '@/lib/coleccion';
import { fmtPen, netoVendedor } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { Confirmar } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { LocChip } from '../Ubicacion';
import { EstadoPub, PublicarSheet } from '../PublicarSheet';

type Filtro = 'todas' | 'activa' | 'pausada' | 'reservada';

/** Mis ventas: todas mis publicaciones en el mercado, con acciones en bloque. */
export function Ventas() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const toast = useToast();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abrir, setAbrir] = useState<Entrada | null>(null);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const comision = precios.ajustes.comision;

  const filas = useMemo(() => {
    const entradas = new Map(col.entradas.map(e => [e.id, e]));
    return col.publicaciones
      .map(p => ({ pub: p, entrada: p.entrada_id ? entradas.get(p.entrada_id) : undefined }))
      .filter(x => filtro === 'todas' || x.pub.estado === filtro)
      .sort((a, b) => Date.parse(b.pub.actualizada) - Date.parse(a.pub.actualizada));
  }, [col.publicaciones, col.entradas, filtro]);
  const resumen = useMemo(() => {
    const r = { activas: 0, pausadas: 0, reservadas: 0, sinFoto: 0, valor: 0 };
    for (const p of col.publicaciones) {
      if (p.estado === 'activa') { r.activas++; r.valor += p.precio_pen * p.cantidad; }
      if (p.estado === 'pausada') { r.pausadas++; if (p.motivo_pausa === 'foto') r.sinFoto++; }
      if (p.estado === 'reservada') r.reservadas++;
    }
    return r;
  }, [col.publicaciones]);
  const seleccion = col.publicaciones.filter(p => sel.has(p.id));
  const puedePausar = seleccion.filter(p => p.estado === 'activa');
  const puedeActivar = seleccion.filter(p => p.estado === 'pausada' && p.motivo_pausa !== 'foto');
  const puedeRetirar = seleccion.filter(p => p.estado !== 'reservada');

  function alternar(id: string) { setSel(x => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y; }); }
  async function accion(lista: Publicacion[], estado: 'activa' | 'pausada' | 'retirada') {
    if (!lista.length) return;
    setOcupado(true);
    const n = await col.cambiarEstado(lista.map(p => p.id), estado);
    setOcupado(false);
    if (n) { toast(`${n} ${n === 1 ? 'publicación' : 'publicaciones'} ${estado === 'activa' ? (n === 1 ? 'activada' : 'activadas') : estado === 'pausada' ? (n === 1 ? 'pausada' : 'pausadas') : (n === 1 ? 'retirada' : 'retiradas')}`, 'ok'); setSel(new Set()); }
    else toast('No se pudo cambiar el estado', 'danger');
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>🏷️ Mis ventas</h2>
        <Link href="/app/cajas" className="btn sm ghost">📦 Cajas</Link>
      </div>
      <p className="small muted">Lo que tienes publicado en el mercado. Los compradores solo ven tu nombre de usuario (@{perfil.username}); nunca tu DNI, teléfono ni nombre real. La comisión es del {Math.round(comision * 100)} % sobre el precio de venta.</p>
      <div className="stat" style={{ margin: '10px 0' }}>
        <div className="box"><b>{resumen.activas}</b><span>activas</span></div>
        <div className="box"><b>{fmtPen(resumen.valor)}</b><span>en venta (recibirías {fmtPen(netoVendedor(resumen.valor, comision))})</span></div>
        <div className="box"><b>{resumen.pausadas}</b><span>pausadas{resumen.reservadas ? ` · ${resumen.reservadas} reservadas` : ''}</span></div>
      </div>
      {resumen.sinFoto ? <div className="notice warn small" style={{ marginBottom: 10 }} data-testid="aviso-fotos">⚠️ {resumen.sinFoto} {resumen.sinFoto === 1 ? 'publicación está pausada' : 'publicaciones están pausadas'} porque el precio supera S/ 50 y no tienen foto real. Ábrelas y agrega la foto para activarlas.</div> : null}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="seg">
          <button className={filtro === 'todas' ? 'active' : ''} onClick={() => setFiltro('todas')}>Todas</button>
          <button className={filtro === 'activa' ? 'active' : ''} onClick={() => setFiltro('activa')}>Activas</button>
          <button className={filtro === 'pausada' ? 'active' : ''} onClick={() => setFiltro('pausada')}>Pausadas</button>
          {resumen.reservadas ? <button className={filtro === 'reservada' ? 'active' : ''} onClick={() => setFiltro('reservada')}>Reservadas</button> : null}
        </div>
        <span className="grow" />
        {filas.length ? <button className="btn sm ghost" onClick={() => setSel(sel.size === filas.length ? new Set() : new Set(filas.map(f => f.pub.id)))}>{sel.size === filas.length ? 'Ninguna' : 'Seleccionar todas'}</button> : null}
      </div>
      {sel.size ? (
        <div className="barra-seleccion" data-testid="barra-ventas">
          <span className="small"><b>{sel.size}</b> {sel.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
          <span className="grow" />
          <button className="btn sm" disabled={ocupado || !puedePausar.length} onClick={() => accion(puedePausar, 'pausada')}>Pausar{puedePausar.length ? ` ${puedePausar.length}` : ''}</button>
          <button className="btn sm" disabled={ocupado || !puedeActivar.length} onClick={() => accion(puedeActivar, 'activa')}>Activar{puedeActivar.length ? ` ${puedeActivar.length}` : ''}</button>
          <button className="btn sm danger" disabled={ocupado || !puedeRetirar.length} onClick={() => setConfirmarRetiro(true)}>Retirar{puedeRetirar.length ? ` ${puedeRetirar.length}` : ''}</button>
        </div>
      ) : null}
      {!col.publicaciones.length ? (
        <div className="empty"><div className="big">🏷️</div><p><b>Todavía no tienes nada en venta.</b></p><p className="muted">Activa «Caja en venta» en una caja, elige cartas sueltas desde la caja, o abre una carta de tu colección y pulsa «Vender en el mercado».</p></div>
      ) : !filas.length ? <div className="empty muted">Nada en este estado.</div> : null}
      <div className="card-list" style={{ marginTop: 10 }}>
        {filas.map(({ pub, entrada }) => {
          const carta = cat.carta(pub.carta_id);
          const set = carta ? cat.setOf(carta) : undefined;
          return (
            <div key={pub.id} className="card-row venta-row" role="button" tabIndex={0} data-testid="fila-venta" onClick={() => { if (entrada) setAbrir(entrada); }}>
              <input type="checkbox" className="sel" checked={sel.has(pub.id)} onClick={e => e.stopPropagation()} onChange={() => alternar(pub.id)} aria-label="Seleccionar" />
              <Thumb carta={carta} set={set} />
              <div className="card-main">
                <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : 'Carta'} <EstadoPub pub={pub} conPrecio={false} /></div>
                <div className="card-set">{nombreColeccion(set, perfil.idioma_nombres)} {carta ? <span className="num">{numLabel(carta, set)}</span> : null}{pub.acabado ? <span className="pill">{pub.acabado}</span> : null}{pub.idioma ? <span className="pill">{pub.idioma}</span> : null}{pub.condicion ? <span className="pill">{pub.condicion}</span> : null}</div>
                <div className="small">{pub.cantidad} {pub.cantidad === 1 ? 'copia' : 'copias'} a <b>{fmtPen(pub.precio_pen)}</b> <span className="muted">({pub.tipo_precio === 'manual' ? 'manual' : 'por defecto'}; recibes {fmtPen(netoVendedor(pub.precio_pen, comision))} c/u)</span>{entrada ? <> · <LocChip loc={ubicador.ubicacion(entrada)} corto /></> : null}</div>
                {pub.aviso ? <div className="small" style={{ color: 'var(--warn)' }}>{pub.aviso}</div> : null}
              </div>
              <div className="card-side">{(pub.fotos || []).length ? <span className="pill">📷 {pub.fotos.length}</span> : null}</div>
            </div>
          );
        })}
      </div>
      {abrir ? <PublicarSheet entrada={abrir} onClose={() => setAbrir(null)} /> : null}
      {confirmarRetiro ? <Confirmar titulo="Retirar publicaciones" texto={`Se retirarán ${puedeRetirar.length} ${puedeRetirar.length === 1 ? 'publicación' : 'publicaciones'} del mercado (las cartas siguen en tu colección) y se borrarán sus fotos.`} okLabel="Retirar" peligro onOk={() => { setConfirmarRetiro(false); accion(puedeRetirar, 'retirada'); }} onClose={() => setConfirmarRetiro(false)} /> : null}
    </div>
  );
}
