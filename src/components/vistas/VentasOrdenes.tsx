'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { DIAS, ETIQUETA_ORDEN, fechaDia, fechaHora, ordenesDe, usernamesDe, type Orden, type OrdenItem, type Tienda } from '@/lib/compras';
import { comprimirImagen } from '@/lib/fotos';
import { fmtPen } from '@/lib/precios-core';
import { Ubicador, type Entrada } from '@/lib/coleccion';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useNotificaciones } from '../NotificacionesProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

const COLOR: Record<string, string> = { pago_confirmado: 'warn', en_tienda: 'primary', entregada: 'ok', saldo_liberado: 'ok', vencida: 'danger', cancelada: '', pago_rechazado: '', reservada: '', revision: '', disputa: 'danger' };

async function accionOrden(body: Record<string, unknown>) {
  return fetch('/api/ordenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false, error: 'Sin conexión' }));
}

/** Mis ventas → Órdenes: lo que vendí y debo entregar. */
export function OrdenesVendedor() {
  const { perfil } = usePerfil();
  const [datos, setDatos] = useState<{ ordenes: Orden[]; items: OrdenItem[]; tiendas: Map<string, Tienda> } | null>(null);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  useEffect(() => { ordenesDe('vendedor_id', perfil.id).then(async d => { setDatos(d); setNombres(await usernamesDe(d.ordenes.map(o => o.comprador_id))); }).catch(() => setDatos({ ordenes: [], items: [], tiendas: new Map() })); }, [perfil.id]);
  const pendientes = (datos?.ordenes || []).filter(o => o.estado === 'pago_confirmado');
  return (
    <div>
      <p className="small"><Link href="/app/ventas">← Mis ventas</Link></p>
      <h2 style={{ marginTop: 0 }}>📦 Órdenes de venta</h2>
      <p className="small muted">Cada orden es una venta confirmada: debes dejar las cartas en la tienda indicada antes de la fecha límite. Tu ganancia se paga apenas el comprador la recoja.</p>
      {pendientes.length ? <Aviso tipo="warn">Tienes {pendientes.length} {pendientes.length === 1 ? 'orden por entregar' : 'órdenes por entregar'}.</Aviso> : null}
      {!datos ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {datos && !datos.ordenes.length ? <div className="empty"><div className="big">📦</div><p><b>Todavía no vendiste nada.</b></p><p className="muted">Cuando alguien compre una de tus cartas y pague, la verás aquí.</p></div> : null}
      <div className="card-list">
        {(datos?.ordenes || []).map(o => (
          <Link key={o.id} href={`/app/ventas/ordenes/${o.id}`} className="card-row" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="fila-orden-venta">
            <div className="card-main">
              <div className="card-name">Orden #{o.numero} · {fmtPen(o.subtotal)} · recibes {fmtPen(o.neto_vendedor)} <span className={`pill ${COLOR[o.estado] || ''}`}>{ETIQUETA_ORDEN[o.estado]}</span></div>
              <div className="card-set">Comprador @{nombres.get(o.comprador_id) || '…'} · {datos?.tiendas.get(o.tienda_id || '')?.nombre || 'tienda'}{o.fecha_limite ? ` · hasta el ${fechaDia(o.fecha_limite)}` : ''}{o.fecha_entrega ? ` · entregas el ${fechaDia(o.fecha_entrega)}` : ''}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Detalle de una orden de venta: cartas con su ubicación, tienda, fecha de entrega y entrega. */
export function OrdenVendedorDetalle({ id }: { id: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const notif = useNotificaciones();
  const toast = useToast();
  const [orden, setOrden] = useState<Orden | null | undefined>(undefined);
  const [items, setItems] = useState<OrdenItem[]>([]);
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [comprador, setComprador] = useState('');
  const [fechas, setFechas] = useState<string[]>([]);
  const [conCuenta, setConCuenta] = useState<boolean | null>(null);
  const [fecha, setFecha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function cargar() {
    const sb = supabaseBrowser();
    const { data: o } = await sb.from('ordenes').select('*').eq('id', id).maybeSingle();
    if (!o) { setOrden(null); return; }
    const oo = { ...o, subtotal: Number(o.subtotal), comision: Number(o.comision), neto_vendedor: Number(o.neto_vendedor) } as Orden;
    setOrden(oo);
    const [{ data: its }, { data: t }, nombres, { data: f }, { data: cc }] = await Promise.all([
      sb.from('orden_items').select('*').eq('orden_id', id),
      oo.tienda_id ? sb.from('tiendas').select('*').eq('id', oo.tienda_id).maybeSingle() : Promise.resolve({ data: null }),
      usernamesDe([oo.comprador_id]),
      sb.rpc('fechas_entrega_posibles', { p_orden: id }),
      oo.tienda_id ? sb.rpc('tienda_con_cuenta', { p_tienda: oo.tienda_id }) : Promise.resolve({ data: true })
    ]);
    setItems(((its || []) as OrdenItem[]).map(i => ({ ...i, precio_pen: Number(i.precio_pen) })));
    setTienda((t as Tienda) || null);
    setComprador(nombres.get(oo.comprador_id) || '');
    const lista = ((f || []) as string[]).map(x => String(x).slice(0, 10));
    setFechas(lista);
    setFecha(oo.fecha_entrega || lista[0] || '');
    setConCuenta(!!cc);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  // Las copias vendidas ya salieron de la colección: se calcula dónde estaban (caja y posición) como si siguieran ahí
  const virtuales = useMemo(() => items.filter(i => i.entrada_datos && !col.entradas.some(x => x.id === i.entrada_id)).map(i => i.entrada_datos as unknown as Entrada), [items, col.entradas]);
  const ubicadorVirtual = useMemo(() => (virtuales.length ? new Ubicador(cat, col.cajas, [...col.entradas, ...virtuales], perfil.idioma_nombres) : null), [virtuales, cat, col.cajas, col.entradas, perfil.idioma_nombres]);

  if (orden === undefined) return <p className="small muted"><span className="spinner" /> Cargando…</p>;
  if (!orden) return <div className="empty">Esa orden no existe. <Link href="/app/ventas/ordenes">Órdenes</Link></div>;

  async function elegirFecha() {
    setOcupado(true);
    const r = await accionOrden({ accion: 'fecha', id, fecha });
    setOcupado(false);
    if (r.ok) { toast('Fecha de entrega guardada: el comprador y la tienda ya lo saben', 'ok', 3500); cargar(); notif.recargar(); } else toast(r.error || 'No se pudo guardar', 'danger', 4000);
  }
  async function subirEntrega(file: File) {
    setOcupado(true);
    try {
      const blob = await comprimirImagen(file, 1600, 0.85);
      const ruta = `${perfil.id}/${id}-${Date.now().toString(36)}.jpg`;
      const sb = supabaseBrowser();
      const { error } = await sb.storage.from('entregas').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);
      const url = sb.storage.from('entregas').getPublicUrl(ruta).data.publicUrl;
      const r = await accionOrden({ accion: 'en_tienda', id, foto: url });
      if (!r.ok) throw new Error(r.error || 'No se pudo registrar');
      toast('Entrega registrada: el comprador ya tiene su código de retiro', 'ok', 4000); cargar(); notif.recargar();
    } catch (e) { toast((e as Error).message, 'danger', 4000); }
    finally { setOcupado(false); }
  }

  const diaNombre = (d: string) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${fechaDia(d)}`;
  return (
    <div>
      <p className="small"><Link href="/app/ventas/ordenes">← Órdenes de venta</Link></p>
      <h2 style={{ marginTop: 0 }}>Orden #{orden.numero} <span className={`pill ${COLOR[orden.estado] || ''}`} data-testid="estado-orden-venta">{ETIQUETA_ORDEN[orden.estado]}</span></h2>
      <p className="small muted">Comprador <b>@{comprador}</b> · vendiste por {fmtPen(orden.subtotal)} · comisión {fmtPen(orden.comision)} · <b>recibes {fmtPen(orden.neto_vendedor)}</b></p>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Qué entregar y dónde estaba en tu colección</h3>
        <div className="card-list">
          {items.map(i => { const c = cat.carta(i.carta_id); const set = c ? cat.setOf(c) : undefined; const e = i.entrada_id ? col.entradas.find(x => x.id === i.entrada_id) : undefined; return (
            <div key={i.id} className="card-row" style={{ cursor: 'default' }} data-testid="item-venta">
              <Thumb carta={c} set={set} />
              <div className="card-main">
                <div className="card-name">{i.cantidad}× {c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id}</div>
                <div className="card-set">{nombreColeccion(set, perfil.idioma_nombres)} {c ? <span className="num">{numLabel(c, set)}</span> : null}{i.acabado ? <span className="pill">{i.acabado}</span> : null}{i.idioma ? <span className="pill">{i.idioma}</span> : null}{i.condicion ? <span className="pill">{i.condicion}</span> : null}</div>
                <div className="small" style={{ marginTop: 3 }} data-testid="ubicacion-venta">{e ? <LocChip loc={ubicador.ubicacion(e)} /> : i.entrada_datos && ubicadorVirtual ? (() => { const v = i.entrada_datos as unknown as Entrada; const loc = ubicadorVirtual.ubicacion(v); return loc ? <><span className="muted">Ya salió de tu colección · estaba en</span> <LocChip loc={loc} /></> : <span className="muted">Ya salió de tu colección{v.caja_id ? ' (su caja ya no existe)' : ' (estaba sin caja)'}</span>; })() : <span className="muted">ya no está en tu colección</span>}</div>
              </div>
              <div className="card-side"><span className="price">{fmtPen(i.precio_pen * i.cantidad)}</span></div>
            </div>
          ); })}
        </div>
      </div>

      {tienda ? <div className="panel"><h3 style={{ marginTop: 0 }}>Tienda de entrega</h3><p style={{ margin: 0 }}><b>{tienda.nombre}</b> · {tienda.distrito}<br /><span className="small">{tienda.direccion}{tienda.referencia ? ` (${tienda.referencia})` : ''}{tienda.horario ? ` · ${tienda.horario}` : ''}</span></p></div> : null}

      {orden.estado === 'pago_confirmado' ? (
        <div className="panel" data-testid="entrega-vendedor">
          <h3 style={{ marginTop: 0 }}>Fecha de entrega</h3>
          <p className="small muted">Debes dejarla en la tienda <b>hasta el {orden.fecha_limite ? diaNombre(orden.fecha_limite) : '—'}</b>. Elige el día en que irás (solo días en que la tienda abre).</p>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" style={{ maxWidth: 260 }} value={fecha} onChange={e => setFecha(e.target.value)} data-testid="select-fecha">{fechas.map(f => <option key={f} value={f}>{diaNombre(f)}</option>)}</select>
            <button className="btn primary" disabled={ocupado || !fecha || fecha === orden.fecha_entrega} onClick={elegirFecha} data-testid="btn-fecha">{orden.fecha_entrega ? 'Cambiar fecha' : 'Confirmar fecha'}</button>
            {orden.fecha_entrega ? <span className="small">✔ Programada para el {fechaDia(orden.fecha_entrega)}</span> : null}
          </div>
          {conCuenta === false ? (
            <div style={{ marginTop: 12 }}>
              <h3>Ya la dejé en la tienda</h3>
              <p className="small muted">Esta tienda aún no tiene cuenta en la app: sube una foto de la carta entregada (en el mostrador o con el comprobante de la tienda) para avisar al comprador.</p>
              <button className="btn" disabled={ocupado} onClick={() => input.current?.click()} data-testid="btn-foto-entrega">{ocupado ? 'Subiendo…' : '📷 Subir foto de la entrega'}</button>
              <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) subirEntrega(f); e.target.value = ''; }} data-testid="input-foto-entrega" />
            </div>
          ) : <p className="small muted" style={{ marginTop: 10 }}>Cuando dejes la carta, el encargado de la tienda la registrará y el comprador recibirá su código de retiro.</p>}
        </div>
      ) : null}
      {orden.estado === 'en_tienda' ? <Aviso tipo="info">La carta está en la tienda desde el {fechaHora(orden.en_tienda_en)}. Cuando el comprador la recoja, tu ganancia queda lista para pagarte.</Aviso> : null}
      {orden.estado === 'entregada' || orden.estado === 'saldo_liberado' ? <Aviso tipo="ok">Entregada el {fechaHora(orden.entregada_en)}. Tu ganancia de {fmtPen(orden.neto_vendedor)} {orden.estado === 'saldo_liberado' ? 'ya fue liberada' : 'se paga en el siguiente día de pago'}; revisa tus datos de cobro en Ajustes.</Aviso> : null}
      {orden.estado === 'vencida' ? <Aviso tipo="danger">{orden.motivo || 'La orden venció.'}</Aviso> : null}
      {orden.foto_entrega_url ? <p className="small"><a href={orden.foto_entrega_url} target="_blank" rel="noreferrer">Ver foto de la entrega</a></p> : null}
    </div>
  );
}
