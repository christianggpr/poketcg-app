'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { anularOrden, cancelarPago, ETIQUETA_ORDEN, ETIQUETA_PAGO, ETIQUETA_RESOLUCION, fechaDia, fechaHora, misPagos, MOTIVOS_RECLAMO, pagoDetalle, puedeAnular, reclamosDe, retirarSaldo, saldoComprador, subirComprobante, urlVoucher, usernamesDe, type Orden, type OrdenItem, type Pago, type Reclamo, type SaldoComprador, type Tienda } from '@/lib/compras';
import { ReclamoSheet } from '../ReclamoSheet';
import { fmtPen } from '@/lib/precios-core';
import { supabaseBrowser } from '@/lib/supabase/client';
import { calificarOrden, reputacionesDe, type VendedorPublico } from '@/lib/reputacion';
import { supabaseBrowser as sbReputacion } from '@/lib/supabase/client';
import { Estrellas, VendedorChip } from '../Vendedor';
import { useCatalogo } from '../CatalogoProvider';
import { useNotificaciones } from '../NotificacionesProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { Confirmar, Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

const COLOR_PAGO: Record<string, string> = { pendiente: 'warn', revision: 'primary', confirmado: 'ok', rechazado: 'danger', vencido: '', cancelado: '' };

/** Mis compras: lista de pagos con su estado. */
export function Compras() {
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { misPagos().then(setPagos).catch(e => setError((e as Error).message)); }, []);
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h2 style={{ margin: 0 }}>🧾 Mis compras</h2>
        <Link href="/app/mercado" className="btn sm ghost">🛒 Mercado</Link>
      </div>
      <SaldoPanel />
      {error ? <Aviso tipo="danger">{error}</Aviso> : null}
      {!pagos && !error ? <p className="muted small"><span className="spinner" /> Cargando…</p> : null}
      {pagos && !pagos.length ? <div className="empty"><div className="big">🧾</div><p><b>Todavía no has comprado.</b></p><p className="muted">Arma tu carrito en el Mercado y pulsa «Comprar».</p></div> : null}
      <div className="card-list" style={{ marginTop: 10 }}>
        {(pagos || []).map(p => (
          <Link key={p.id} href={`/app/compras/${p.id}`} className="card-row" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="fila-compra">
            <div className="card-main">
              <div className="card-name">Compra #{p.numero} · {fmtPen(p.monto)} <span className={`pill ${COLOR_PAGO[p.estado] || ''}`}>{ETIQUETA_PAGO[p.estado]}</span></div>
              <div className="card-set">{fechaHora(p.creado)}{p.n_operacion ? ` · operación ${p.n_operacion}` : ''}{p.motivo ? ` · ${p.motivo}` : ''}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Saldo del comprador (devoluciones): se usa en la siguiente compra o se retira a Yape/Plin/banco. */
function SaldoPanel() {
  const toast = useToast();
  const [saldo, setSaldo] = useState<SaldoComprador | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const cargar = () => saldoComprador().then(setSaldo);
  useEffect(() => { cargar(); }, []);
  if (!saldo || (saldo.saldo <= 0 && !saldo.movimientos.length && saldo.retiro_pendiente <= 0)) return null;
  async function retirar() {
    setOcupado(true);
    const r = await retirarSaldo();
    setOcupado(false);
    if (r.ok) { toast(r.sin_datos ? `Retiro de ${fmtPen(r.monto || 0)} registrado: registra tus datos de cobro en Ajustes para que te paguemos` : `Retiro de ${fmtPen(r.monto || 0)} en camino: se paga en el siguiente día de pago`, 'ok', 5000); cargar(); } else toast(r.error || 'No se pudo', 'danger', 4000);
  }
  const TIPO: Record<string, string> = { devolucion: 'Devolución', uso_compra: 'Usado en compra', retiro: 'Retiro', ajuste: 'Ajuste' };
  return (
    <div className="panel" style={{ marginTop: 10 }} data-testid="saldo-comprador">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div><b>💳 Tu saldo: <span data-testid="saldo-monto">{fmtPen(saldo.saldo)}</span></b>{saldo.retiro_pendiente > 0 ? <span className="small muted"> · {fmtPen(saldo.retiro_pendiente)} en camino a tu Yape</span> : null}</div>
        <div className="row" style={{ gap: 6 }}>
          {saldo.saldo > 0 ? <button className="btn sm" disabled={ocupado} onClick={() => setConfirmar(true)} data-testid="btn-retirar-saldo">Retirar a mi Yape/Plin</button> : null}
          <button className="btn sm ghost" onClick={() => setAbrir(a => !a)}>{abrir ? 'Ocultar' : 'Movimientos'}</button>
        </div>
      </div>
      <p className="small muted" style={{ margin: '4px 0 0' }}>Las devoluciones caen aquí al instante. Se descuenta solo en tu siguiente compra, o lo retiras y te lo pagamos en el siguiente día de pago a tus datos de cobro.</p>
      {abrir ? <div className="card-list" style={{ marginTop: 8 }}>{saldo.movimientos.map(m => <div key={m.id} className="card-row" style={{ cursor: 'default' }}><div className="card-main"><div className="card-name">{TIPO[m.tipo] || m.tipo} · <span style={{ color: m.monto >= 0 ? 'var(--ok)' : 'inherit' }}>{m.monto >= 0 ? '+' : ''}{fmtPen(m.monto)}</span></div><div className="card-set">{m.detalle} · {fechaHora(m.creado)}</div></div></div>)}{!saldo.movimientos.length ? <p className="small muted">Sin movimientos.</p> : null}</div> : null}
      {confirmar ? <Confirmar titulo="Retirar tu saldo" texto={`Te pagaremos ${fmtPen(saldo.saldo)} a tus datos de cobro (Ajustes) en el siguiente día de pago. Si prefieres, puedes dejarlo y se descuenta solo en tu próxima compra.`} okLabel="Sí, retirar" onOk={() => { setConfirmar(false); retirar(); }} onClose={() => setConfirmar(false)} /> : null}
    </div>
  );
}

/** Detalle de una compra: instrucciones de pago, comprobante, órdenes por vendedor y códigos de retiro. */
export function CompraDetalle({ id }: { id: string }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const notif = useNotificaciones();
  const toast = useToast();
  const router = useRouter();
  const [datos, setDatos] = useState<{ pago: Pago; ordenes: Orden[]; items: OrdenItem[]; tienda: Tienda | null } | null | undefined>(undefined);
  const [vendedores, setVendedores] = useState<Map<string, string>>(new Map());
  const [voucher, setVoucher] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [operacion, setOperacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [confirmarEntrega, setConfirmarEntrega] = useState<Orden | null>(null);
  const [reputaciones, setReputaciones] = useState<Map<string, VendedorPublico>>(new Map());
  const [resenas, setResenas] = useState<Map<string, { puntaje: number; comentario: string; creada: string }>>(new Map());
  const [calificar, setCalificar] = useState<Orden | null>(null);
  const [reclamos, setReclamos] = useState<Map<string, Reclamo>>(new Map());
  const [reclamar, setReclamar] = useState<Orden | null>(null);
  const [anular, setAnular] = useState<Orden | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const pagosAj = precios.ajustes.pagos;

  async function cargar() {
    try {
      const d = await pagoDetalle(id); setDatos(d);
      if (d) {
        setVendedores(await usernamesDe(d.ordenes.map(o => o.vendedor_id)));
        setVoucher(await urlVoucher(d.pago.voucher_url));
        reputacionesDe(d.ordenes.map(o => o.vendedor_id)).then(setReputaciones);
        reclamosDe(d.ordenes.map(o => o.id)).then(setReclamos);
        const { data: rs } = await sbReputacion().from('resenas').select('orden_id, puntaje, comentario, creada').in('orden_id', d.ordenes.map(o => o.id));
        setResenas(new Map(((rs || []) as { orden_id: string; puntaje: number; comentario: string; creada: string }[]).map(r => [r.orden_id, { puntaje: Number(r.puntaje), comentario: r.comentario, creada: r.creada }])));
      }
    }
    catch (e) { toast((e as Error).message, 'danger'); setDatos(null); }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => {
    // tiempo real: el administrador confirma o rechaza, el vendedor entrega…
    const sb = supabaseBrowser();
    const ch = sb.channel('compra-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pagos', filter: `id=eq.${id}` }, () => cargar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ordenes', filter: `pago_id=eq.${id}` }, () => cargar())
      .subscribe();
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  if (datos === undefined) return <p className="muted small"><span className="spinner" /> Cargando…</p>;
  if (!datos) return <div className="empty">Esa compra no existe. <Link href="/app/compras">Mis compras</Link></div>;
  const { pago, ordenes, items, tienda } = datos;
  const restante = Math.max(0, Date.parse(pago.expira) - ahora);
  const minutos = Math.floor(restante / 60000), segundos = Math.floor((restante % 60000) / 1000);
  const vencida = pago.estado === 'pendiente' && restante <= 0;
  const metodos = (pagosAj?.metodos && pagosAj.metodos.length ? pagosAj.metodos : ['Yape']).join(' o ');

  async function enviar() {
    if (!archivo) { toast('Adjunta la captura del comprobante', 'danger'); return; }
    if (operacion.replace(/\s/g, '').length < 4) { toast('Escribe el número de operación', 'danger'); return; }
    setEnviando(true);
    const r = await subirComprobante(perfil.id, pago.id, archivo, operacion);
    setEnviando(false);
    if (!r.ok) { toast(r.error || 'No se pudo enviar', 'danger', 4000); if (/venció/.test(r.error || '')) cargar(); return; }
    toast('Comprobante enviado: lo revisamos y te avisamos', 'ok', 4000);
    setArchivo(null); setOperacion('');
    cargar(); notif.recargar();
  }
  async function marcarEntregada(o: Orden) {
    const r = await fetch('/api/ordenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'entregada', id: o.id }) }).then(x => x.json()).catch(() => ({ ok: false, error: 'Sin conexión' }));
    if (r.ok) { toast('¡Listo! Las cartas ya están en tu colección: dinos dónde las guardas desde Álbumes → Recibidas.', 'ok', 4500); cargar(); notif.recargar(); } else toast(r.error || 'No se pudo confirmar', 'danger', 4000);
  }
  async function anularOrdenAhora(o: Orden) {
    const r = await anularOrden(o.id);
    if (r.ok) { toast('Orden anulada: el dinero ya está en tu saldo', 'ok', 4500); cargar(); notif.recargar(); } else toast(r.error || 'No se pudo anular', 'danger', 5000);
  }
  async function cancelarCompra() {
    const r = await cancelarPago(pago.id);
    if (r.ok) { toast('Compra cancelada; las cartas volvieron al mercado', 'ok'); cargar(); } else toast(r.error || 'No se pudo cancelar', 'danger');
  }

  return (
    <div>
      <p className="small"><Link href="/app/compras">← Mis compras</Link></p>
      <h2 style={{ marginTop: 0 }}>Compra #{pago.numero} <span className={`pill ${COLOR_PAGO[pago.estado] || ''}`} data-testid="estado-pago">{ETIQUETA_PAGO[pago.estado]}</span></h2>
      <p className="small muted">{fechaHora(pago.creado)} · total <b>{fmtPen(pago.monto)}</b>{tienda ? <> · recoges en <b>{tienda.nombre}</b> ({tienda.distrito})</> : null}</p>

      {pago.estado === 'pendiente' && !vencida ? (
        <div className="panel" data-testid="instrucciones-pago">
          <h3 style={{ marginTop: 0 }}>1. Paga por {metodos}</h3>
          <p>Envía <b data-testid="monto-yape">{fmtPen(pago.monto_yape ?? pago.monto)}</b> al número <b style={{ fontSize: 20 }}>{pagosAj?.yape_numero || '949114582'}</b>{pagosAj?.yape_nombre ? <> a nombre de <b>{pagosAj.yape_nombre}</b></> : null}.{(pago.monto_saldo || 0) > 0 ? <span className="small muted"> (El total es {fmtPen(pago.monto)}: {fmtPen(pago.monto_saldo || 0)} se descontaron de tu saldo.)</span> : null}</p>
          <p className="small" style={{ color: 'var(--warn)' }}>⏱️ Tienes <b>{minutos} min {String(segundos).padStart(2, '0')} s</b> para enviar el comprobante; si no, la reserva se libera y las cartas vuelven al mercado.</p>
          <h3>2. Sube la captura y el número de operación</h3>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn" onClick={() => input.current?.click()}>{archivo ? '📎 ' + archivo.name.slice(0, 28) : '📷 Elegir captura del comprobante'}</button>
            <input ref={input} type="file" accept="image/*" hidden onChange={e => { setArchivo(e.target.files?.[0] || null); e.target.value = ''; }} data-testid="input-voucher" />
            <input className="input" style={{ maxWidth: 220 }} placeholder="N.º de operación" value={operacion} onChange={e => setOperacion(e.target.value)} data-testid="input-operacion" />
            <button className="btn primary" disabled={enviando} onClick={enviar} data-testid="btn-enviar-comprobante">{enviando ? 'Enviando…' : 'Enviar comprobante'}</button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>El número de operación aparece en el comprobante de {metodos}. Confirmamos los pagos a mano, normalmente el mismo día.</p>
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setCancelar(true)}>Cancelar la compra</button>
        </div>
      ) : null}
      {vencida ? <Aviso tipo="warn">La reserva venció sin comprobante. Las cartas volvieron al mercado; puedes armar el carrito otra vez.</Aviso> : null}
      {pago.estado === 'revision' ? <Aviso tipo="info"><b>Recibimos tu comprobante</b> (operación {pago.n_operacion}). Lo revisamos y te avisamos por notificación y correo apenas se confirme. Las cartas siguen reservadas para ti.</Aviso> : null}
      {pago.estado === 'rechazado' ? <Aviso tipo="danger"><b>El pago no fue aceptado:</b> {pago.motivo}. Si fue un error, vuelve a comprar y sube el comprobante correcto.</Aviso> : null}
      {pago.estado === 'confirmado' ? <Aviso tipo="ok"><b>Pago confirmado{pago.n_operacion === 'SALDO' ? ' con tu saldo' : ''}.</b> {tienda ? `Recoge tus cartas en ${tienda.nombre} (${tienda.direccion}${tienda.horario ? ' · ' + tienda.horario : ''}).` : ''} Te avisaremos cuando cada orden esté en la tienda, con su código de retiro.</Aviso> : null}
      {voucher ? <p className="small"><a href={voucher} target="_blank" rel="noreferrer">Ver mi comprobante</a></p> : null}

      <h3 style={{ marginBottom: 6 }}>{ordenes.length === 1 ? 'Tu orden' : `Tus ${ordenes.length} órdenes (una por vendedor)`}</h3>
      {ordenes.map(o => (
        <div key={o.id} className="panel" style={{ marginBottom: 10 }} data-testid="orden">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <div><b>Orden #{o.numero}</b> · vende {vendedores.get(o.vendedor_id) ? <VendedorChip username={vendedores.get(o.vendedor_id)!} reputacion={reputaciones.get(o.vendedor_id)?.reputacion} corto /> : '…'} · {fmtPen(o.subtotal)}</div>
            <span className="pill primary">{ETIQUETA_ORDEN[o.estado]}</span>
          </div>
          {o.estado === 'pago_confirmado' ? <div className="small muted" style={{ marginTop: 4 }}>El vendedor debe dejarla en la tienda hasta el <b>{fechaDia(o.fecha_limite)}</b>{o.fecha_entrega ? <> (eligió el {fechaDia(o.fecha_entrega)})</> : <> (tiene {pagosAj?.plazo_fecha_horas ?? 48} h para elegir la fecha)</>}.</div> : null}
          {o.estado === 'pago_confirmado' && puedeAnular(o, pagosAj?.plazo_fecha_horas ?? 48) ? <div className="notice warn small" style={{ marginTop: 6 }}>⏰ El vendedor {o.fecha_entrega ? 'no entregó en la fecha prometida' : 'no eligió fecha de entrega a tiempo'}. Puedes esperar o <button className="link" onClick={() => setAnular(o)} data-testid="btn-anular-orden">anular y recuperar tu dinero</button> (vuelve a tu saldo al instante).</div> : null}
          {o.estado === 'en_tienda' ? <div className="small muted" style={{ marginTop: 6 }}>Revisa las cartas en la tienda antes de llevártelas. ¿Algo no está bien? <button className="link" onClick={() => setReclamar(o)} data-testid="btn-reclamar">Abrir un reclamo</button> (déjalas en la tienda).</div> : null}
          {o.estado === 'disputa' && reclamos.get(o.id) ? <div className="notice info small" style={{ marginTop: 6 }} data-testid="orden-disputa">📝 <b>Reclamo #{reclamos.get(o.id)!.numero} en revisión</b> · {MOTIVOS_RECLAMO[reclamos.get(o.id)!.motivo]}. Deja las cartas en la tienda; te avisamos cuando el administrador lo resuelva.</div> : null}
          {o.estado !== 'disputa' && reclamos.get(o.id)?.estado === 'resuelto' ? <div className="small" style={{ marginTop: 4 }} data-testid="orden-reclamo-resuelto">📝 Reclamo #{reclamos.get(o.id)!.numero} resuelto: {ETIQUETA_RESOLUCION[reclamos.get(o.id)!.resolucion!]}{reclamos.get(o.id)!.monto_devuelto ? ` (${fmtPen(reclamos.get(o.id)!.monto_devuelto!)} a tu saldo)` : ''}{reclamos.get(o.id)!.nota_admin ? ` · ${reclamos.get(o.id)!.nota_admin}` : ''}.</div> : null}
          {o.estado === 'en_tienda' ? <div className="notice ok" style={{ marginTop: 6 }}>🏪 <b>Ya está en la tienda.</b> Muestra este código para recogerla: <b style={{ fontSize: 22, letterSpacing: 2 }} data-testid="codigo-retiro">{o.codigo_retiro}</b><div style={{ marginTop: 6 }}><button className="btn sm primary" onClick={() => setConfirmarEntrega(o)} data-testid="btn-entregado">✅ Ya la recogí (Entregado)</button></div></div> : null}
          {o.estado === 'pago_confirmado' ? <div className="small muted" style={{ marginTop: 4 }}>¿Ya tienes la carta en la mano? <button className="link" onClick={() => setConfirmarEntrega(o)}>Marcar como entregada</button></div> : null}
          {o.estado === 'entregada' || o.estado === 'saldo_liberado' ? <div className="small" style={{ marginTop: 4 }} data-testid="orden-entregada">✅ Entregada el {fechaHora(o.entregada_en)}. Las cartas ya están en tu colección: <Link href="/app/album">dinos dónde las guardas</Link> (Álbumes → Recibidas).</div> : null}
          {o.estado === 'entregada' || o.estado === 'saldo_liberado' ? (
            resenas.get(o.id)
              ? <div className="small" style={{ marginTop: 6 }} data-testid="mi-resena">Tu calificación: <Estrellas valor={resenas.get(o.id)!.puntaje} tam={18} />{resenas.get(o.id)!.comentario ? <> «{resenas.get(o.id)!.comentario}»</> : null}{Date.now() - Date.parse(resenas.get(o.id)!.creada) < 7 * 86400000 ? <> · <button className="link" onClick={() => setCalificar(o)}>cambiar</button></> : null}</div>
              : <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}><span className="small">¿Qué tal el vendedor?</span><button className="btn sm primary" onClick={() => setCalificar(o)} data-testid="btn-calificar">★ Calificar</button></div>
          ) : null}
          {o.motivo && ['cancelada', 'vencida', 'pago_rechazado', 'disputa'].includes(o.estado) ? <div className="small" style={{ marginTop: 4, color: 'var(--warn)' }}>{o.motivo}</div> : null}
          <div className="card-list" style={{ marginTop: 8 }}>
            {items.filter(i => i.orden_id === o.id).map(i => { const c = cat.carta(i.carta_id); const set = c ? cat.setOf(c) : undefined; return (
              <div key={i.id} className="card-row" style={{ cursor: 'default' }}>
                <Thumb carta={c} set={set} />
                <div className="card-main">
                  <div className="card-name">{i.cantidad}× {c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id}</div>
                  <div className="card-set">{nombreColeccion(set, perfil.idioma_nombres)} {c ? <span className="num">{numLabel(c, set)}</span> : null}{i.acabado ? <span className="pill">{i.acabado}</span> : null}{i.idioma ? <span className="pill">{i.idioma}</span> : null}{i.condicion ? <span className="pill">{i.condicion}</span> : null}</div>
                </div>
                <div className="card-side"><span className="price">{fmtPen(i.precio_pen * i.cantidad)}</span>{o.estado === 'entregada' || o.estado === 'saldo_liberado' ? <span className="pill ok" style={{ marginTop: 4 }} data-testid="en-mi-coleccion">en tu colección</span> : null}</div>
              </div>
            ); })}
          </div>
        </div>
      ))}
      {calificar ? <CalificarSheet orden={calificar} vendedor={vendedores.get(calificar.vendedor_id) || ''} inicial={resenas.get(calificar.id)} onClose={() => setCalificar(null)} onListo={() => { setCalificar(null); cargar(); }} /> : null}
      {confirmarEntrega ? <Confirmar titulo={`Confirmar entrega de la orden #${confirmarEntrega.numero}`} texto="Confirma solo si ya tienes las cartas en tu poder. Con tu confirmación se paga al vendedor." okLabel="Sí, ya las tengo" onOk={() => { const o = confirmarEntrega; setConfirmarEntrega(null); marcarEntregada(o); }} onClose={() => setConfirmarEntrega(null)} /> : null}
      {reclamar ? <ReclamoSheet orden={reclamar} onClose={() => setReclamar(null)} onListo={() => { setReclamar(null); cargar(); notif.recargar(); }} /> : null}
      {anular ? <Confirmar titulo={`Anular la orden #${anular.numero}`} texto={`Se anula la compra de estas cartas y ${fmtPen(anular.subtotal)} vuelven a tu saldo al instante (lo usas en otra compra o lo retiras a tu Yape). El vendedor recibe una falta.`} okLabel="Anular y recuperar mi dinero" peligro onOk={() => { const o = anular; setAnular(null); anularOrdenAhora(o); }} onClose={() => setAnular(null)} /> : null}
      {cancelar ? <Confirmar titulo="Cancelar la compra" texto="Las cartas volverán al mercado y tendrás que armar el carrito de nuevo si cambias de idea." okLabel="Cancelar compra" peligro onOk={() => { setCancelar(false); cancelarCompra(); }} onClose={() => setCancelar(false)} /> : null}
      {pago.estado !== 'pendiente' ? <p className="small" style={{ marginTop: 8 }}><button className="link" onClick={() => router.push('/app/mercado')}>Seguir comprando</button></p> : null}
    </div>
  );
}


/** Calificación del vendedor (1–5 estrellas y comentario) tras una orden entregada. */
function CalificarSheet({ orden, vendedor, inicial, onClose, onListo }: { orden: Orden; vendedor: string; inicial?: { puntaje: number; comentario: string }; onClose: () => void; onListo: () => void }) {
  const toast = useToast();
  const [puntaje, setPuntaje] = useState(inicial?.puntaje || 0);
  const [comentario, setComentario] = useState(inicial?.comentario || '');
  const [ocupado, setOcupado] = useState(false);
  const textos = ['', 'Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'];
  async function enviar() {
    if (!puntaje) { toast('Elige de 1 a 5 estrellas', 'danger'); return; }
    setOcupado(true);
    const r = await calificarOrden(orden.id, puntaje, comentario.trim());
    setOcupado(false);
    if (!r.ok) { toast(r.error || 'No se pudo calificar', 'danger', 4000); return; }
    toast('¡Gracias! Tu calificación ayuda a otros compradores.', 'ok', 3500);
    onListo();
  }
  return (
    <Sheet titulo={`Califica a @${vendedor} · orden #${orden.numero}`} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || !puntaje} onClick={enviar} data-testid="btn-enviar-calificacion">{ocupado ? 'Enviando…' : 'Enviar calificación'}</button></>}>
      <p className="small muted">Califica la experiencia: ¿las cartas llegaron como se publicaron y a tiempo? Tu reseña es pública (con tu nombre de usuario) y puedes corregirla durante 7 días.</p>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}><Estrellas valor={puntaje} onChange={setPuntaje} tam={34} /><b>{textos[puntaje]}</b></div>
      <textarea className="input" rows={3} maxLength={500} placeholder="Comentario (opcional): estado de las cartas, puntualidad, trato…" value={comentario} onChange={e => setComentario(e.target.value)} style={{ marginTop: 10 }} data-testid="input-comentario" />
    </Sheet>
  );
}
