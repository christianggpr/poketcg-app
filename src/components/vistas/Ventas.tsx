'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fechaHora, urlVoucher } from '@/lib/compras';
import { resenasDe, responderResena, type ResenaPublica } from '@/lib/reputacion';
import { Estrellas, Insignias } from '../Vendedor';
import { supabaseBrowser } from '@/lib/supabase/client';
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
        <div className="row" style={{ gap: 6 }}><Link href="/app/ventas/ordenes" className="btn sm primary" data-testid="btn-ordenes-venta">📦 Órdenes de venta</Link><Link href="/app/bulk" className="btn sm ghost">Cajas</Link></div>
      </div>
      <p className="small muted">Lo que tienes publicado en el mercado. Los compradores solo ven tu nombre de usuario (@{perfil.username}); nunca tu DNI, teléfono ni nombre real. La comisión es del {Math.round(comision * 100)} % sobre el precio de venta.</p>
      <MiReputacion />
      <MiSaldo />
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

type Saldo = { en_curso: number; por_liberar: number; por_pagar: number; sin_datos: boolean; pagado: number; ordenes_vendidas: number };
type RetiroMio = { id: string; numero: number; monto: number; ordenes: string[]; estado: string; n_operacion: string | null; comprobante_url: string | null; pagado_en: string | null; creado: string };

/** Mi saldo: ganancias en curso, por pagar y pagadas (los pagos se hacen cada día a tus datos de cobro). */
function MiSaldo() {
  const toast = useToast();
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [retiros, setRetiros] = useState<RetiroMio[]>([]);
  const [abrir, setAbrir] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.rpc('mi_saldo').then(({ data }) => { if (data) setSaldo({ ...data, en_curso: Number(data.en_curso), por_liberar: Number(data.por_liberar), por_pagar: Number(data.por_pagar), pagado: Number(data.pagado) }); });
    sb.from('retiros').select('*').order('creado', { ascending: false }).limit(50).then(({ data }) => setRetiros(((data || []) as RetiroMio[]).map(r => ({ ...r, monto: Number(r.monto) }))));
  }, []);
  async function verComprobante(r: RetiroMio) {
    const url = await urlVoucher(r.comprobante_url);
    if (url) window.open(url, '_blank', 'noopener'); else toast('No se pudo abrir el comprobante', 'danger');
  }
  if (!saldo || (!saldo.ordenes_vendidas && !saldo.en_curso && !saldo.por_pagar)) return null;
  return (
    <div className="panel" data-testid="mi-saldo">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>💰 Mi saldo</h3><button className="btn sm ghost" onClick={() => setAbrir(a => !a)}>{abrir ? 'Ocultar' : 'Ver movimientos'}</button></div>
      <div className="stat" style={{ marginTop: 8 }}>
        <div className="box"><b>{fmtPen(saldo.en_curso + saldo.por_liberar)}</b><span>ventas en curso</span></div>
        <div className="box"><b>{fmtPen(saldo.por_pagar)}</b><span>por pagarte{saldo.sin_datos ? ' · faltan datos de cobro' : ''}</span></div>
        <div className="box"><b>{fmtPen(saldo.pagado)}</b><span>ya pagado</span></div>
      </div>
      {saldo.sin_datos ? <div className="notice warn small" style={{ marginTop: 8 }}>Para pagarte, registra tus datos de cobro en <Link href="/app/ajustes">Ajustes</Link>.</div> : <p className="small muted" style={{ marginTop: 6 }}>Cada entrega confirmada se paga a tus datos de cobro en el siguiente día de pago (todos los días).</p>}
      {abrir ? (
        <div className="card-list" style={{ marginTop: 8 }}>
          {retiros.map(r => <div key={r.id} className="card-row" style={{ cursor: 'default' }} data-testid="retiro"><div className="card-main"><div className="card-name">Pago #{r.numero} · {fmtPen(r.monto)} <span className={`pill ${r.estado === 'pagado' ? 'ok' : r.estado === 'sin_datos' ? 'warn' : 'primary'}`}>{r.estado === 'pagado' ? 'pagado' : r.estado === 'sin_datos' ? 'faltan datos de cobro' : 'por pagar'}</span></div><div className="card-set">{r.ordenes.length} {r.ordenes.length === 1 ? 'orden' : 'órdenes'} · {fechaHora(r.creado)}{r.pagado_en ? ` · pagado ${fechaHora(r.pagado_en)}` : ''}{r.n_operacion ? ` · operación ${r.n_operacion}` : ''}</div></div>{r.comprobante_url ? <div className="card-side"><button className="btn sm ghost" onClick={() => verComprobante(r)} data-testid="btn-ver-comprobante">Comprobante</button></div> : null}</div>)}
          {!retiros.length ? <p className="small muted">Sin movimientos todavía.</p> : null}
        </div>
      ) : null}
    </div>
  );
}


/** Reputación del vendedor (puntaje, ventas, insignias) y sus reseñas, con respuesta. */
function MiReputacion() {
  const { perfil } = usePerfil();
  const toast = useToast();
  const [resenas, setResenas] = useState<ResenaPublica[] | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [respuesta, setRespuesta] = useState<{ id: string; texto: string } | null>(null);
  const rep = perfil.reputacion || {};
  useEffect(() => { if (abrir && resenas === null) resenasDe(perfil.id, 30).then(setResenas); }, [abrir, resenas, perfil.id]);
  if (!(rep.ventas || 0) && !(rep.resenas || 0) && perfil.estado !== 'suspendido') return null;
  async function responder() {
    if (!respuesta) return;
    const r = await responderResena(respuesta.id, respuesta.texto);
    if (r.ok) { toast('Respuesta publicada', 'ok'); setRespuesta(null); setResenas(null); } else toast(r.error || 'No se pudo responder', 'danger');
  }
  return (
    <div className="panel" data-testid="mi-reputacion">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>⭐ Tu reputación</h3>
        <div className="row" style={{ gap: 6 }}><Link href={`/u/${encodeURIComponent(perfil.username)}`} className="btn sm ghost" target="_blank">Ver mi perfil público</Link><button className="btn sm ghost" onClick={() => setAbrir(a => !a)}>{abrir ? 'Ocultar reseñas' : 'Ver reseñas'}</button></div>
      </div>
      {perfil.estado === 'suspendido' ? <div className="notice danger small" style={{ marginTop: 8 }}>Tu cuenta está suspendida{perfil.suspendido_motivo ? `: ${perfil.suspendido_motivo}` : ''}. No puedes vender ni comprar hasta que el administrador la reactive.</div> : null}
      <div className="rep-grid" style={{ marginTop: 8 }}>
        <div className="box"><b>{rep.puntaje != null ? Number(rep.puntaje).toFixed(1) : '—'}</b><span>{rep.resenas || 0} {rep.resenas === 1 ? 'reseña' : 'reseñas'}</span></div>
        <div className="box"><b>{rep.ventas || 0}</b><span>ventas entregadas</span></div>
        <div className="box"><b>{rep.cumple_pct != null ? `${rep.cumple_pct} %` : '—'}</b><span>entregas a tiempo</span></div>
        <div className="box"><b>{rep.confirma_horas != null ? `${rep.confirma_horas} h` : '—'}</b><span>para elegir fecha</span></div>
      </div>
      <div style={{ marginTop: 8 }}><Insignias reputacion={rep} /></div>
      <p className="small muted" style={{ marginTop: 6 }}>Las insignias se calculan solas: elige la fecha rápido, entrega en la fecha y no dejes vencer órdenes. Los compradores las ven en cada oferta.</p>
      {abrir ? (
        <div style={{ marginTop: 8 }}>
          {resenas === null ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
          {resenas && !resenas.length ? <p className="small muted">Todavía no tienes reseñas.</p> : null}
          {(resenas || []).map(r => (
            <div key={r.id} className="resena" data-testid="resena">
              <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Estrellas valor={r.puntaje} tam={16} /><b>@{r.comprador}</b><span className="small muted">orden #{r.orden_numero} · {fechaHora(r.creada)}</span></div>
              {r.comentario ? <div style={{ marginTop: 4 }}>{r.comentario}</div> : null}
              {r.respuesta ? <div className="resp">Tu respuesta: {r.respuesta}</div> : respuesta?.id === r.id ? (
                <div className="row" style={{ gap: 6, marginTop: 6 }}><input className="input" maxLength={300} value={respuesta.texto} onChange={e => setRespuesta({ id: r.id, texto: e.target.value })} placeholder="Tu respuesta pública" data-testid="input-respuesta" /><button className="btn sm primary" onClick={responder} data-testid="btn-enviar-respuesta">Publicar</button><button className="btn sm" onClick={() => setRespuesta(null)}>Cancelar</button></div>
              ) : <button className="link small" style={{ marginTop: 4 }} onClick={() => setRespuesta({ id: r.id, texto: '' })} data-testid="btn-responder">Responder</button>}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
