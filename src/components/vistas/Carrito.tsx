'use client';
import { Icono } from '../Icono';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { crearPago, saldoComprador, tiendasActivas, DIAS_CORTOS, type Tienda } from '@/lib/compras';
import type { LineaCarrito } from '@/lib/mercado';
import { fmtPen, textoPlazo } from '@/lib/precios-core';
import { enlaceMapa } from '@/lib/tiendas-core';
import { CLAVE_TIENDA_PREFERIDA } from '@/lib/filtros';
import { reputacionesDe, type VendedorPublico } from '@/lib/reputacion';
import { VendedorChip } from '../Vendedor';
import { useCatalogo } from '../CatalogoProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

/** Carrito (layout v2): líneas con Quitar, reserva, tienda de recojo como opciones grandes, saldo, resumen y «Continuar al pago».
 *  En PC el resumen va a la derecha (como en PC-Checkout); el pago se hace en la siguiente pantalla (/app/compras/<id>). */
export function Carrito() {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const precios = usePrecios();
  const toast = useToast();
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [saldo, setSaldo] = useState(0);
  const [usarSaldo, setUsarSaldo] = useState(true);
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const [tiendaSel, setTiendaSel] = useState('');
  const [creando, setCreando] = useState(false);
  useEffect(() => { saldoComprador().then(s => setSaldo(s.saldo)).catch(() => setSaldo(0)); }, []);
  // Mejoras 5 · C: el "Punto de entrega" elegido en los filtros del Mercado queda preseleccionado
  useEffect(() => { tiendasActivas().then(t => { setTiendas(t); let pref = ''; try { pref = localStorage.getItem(CLAVE_TIENDA_PREFERIDA) || ''; } catch { /* sin almacenamiento */ } if (pref && t.some(x => x.id === pref)) setTiendaSel(pref); else if (t.length === 1) setTiendaSel(t[0].id); }).catch(() => setTiendas([])); }, []);
  const [reputaciones, setReputaciones] = useState<Map<string, VendedorPublico>>(new Map());
  const comision = precios.ajustes.comision;
  const lineas = mercado.carrito;
  const idsVendedores = lineas.map(l => l.vendedor_id).sort().join(',');
  useEffect(() => { if (idsVendedores) reputacionesDe(idsVendedores.split(',')).then(setReputaciones); }, [idsVendedores]);
  const total = mercado.total;
  const vendedores = [...new Set(lineas.map(l => l.vendedor))];
  const conProblema = lineas.filter(l => l.estado_publicacion !== 'activa' && l.estado_publicacion !== 'reservada');
  const tienda = (tiendas || []).find(t => t.id === tiendaSel) || null;
  const saldoUsado = usarSaldo && saldo > 0 ? Math.min(saldo, total) : 0;
  const aPagar = Math.max(0, Math.round((total - saldoUsado) * 100) / 100);
  const expiraMin = lineas.length ? lineas.map(l => Date.parse(l.expira)).reduce((a, b) => Math.min(a, b)) : 0;

  async function cambiar(l: LineaCarrito, cantidad: number) {
    if (cantidad < 1) return quitar(l);
    setOcupado(l.id);
    const r = await mercado.reservar(l.publicacion_id, cantidad);
    setOcupado(null);
    if (!r.ok) toast(r.error || 'No se pudo cambiar la cantidad', 'danger');
  }
  async function quitar(l: LineaCarrito) {
    setOcupado(l.id);
    const ok = await mercado.liberar(l.id);
    setOcupado(null);
    toast(ok ? 'Quitada del carrito' : 'No se pudo quitar', ok ? 'ok' : 'danger');
  }
  async function continuar() {
    if (!tiendaSel) { toast('Elige dónde recoges tus cartas', 'danger'); return; }
    setCreando(true);
    const r = await crearPago(tiendaSel, usarSaldo && saldo > 0);
    setCreando(false);
    if (!r.ok || !r.pago_id) { toast(r.error || 'No se pudo iniciar la compra', 'danger', 4000); return; }
    if (r.confirmado) toast('¡Compra pagada con tu saldo y confirmada!', 'ok', 4000);
    mercado.recargarCarrito();
    router.push(`/app/compras/${r.pago_id}`);
  }
  const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

  const resumen = lineas.length ? (
    <div className="panel resumen-carrito" data-testid="resumen-carrito">
      <h3 style={{ margin: '0 0 8px' }}>Pagar con Yape</h3>
      <div className="fila-dato"><span className="muted">{mercado.unidades} {mercado.unidades === 1 ? 'carta' : 'cartas'} de {vendedores.length} {vendedores.length === 1 ? 'vendedor' : 'vendedores'}</span><b>{fmtPen(total)}</b></div>
      <div className="fila-dato"><span className="muted">Recojo en tienda</span><b>{tienda ? (tienda.tarifa_recojo && tienda.tarifa_recojo > 0 ? `${fmtPen(tienda.tarifa_recojo)} (se paga en la tienda)` : 'gratis') : '—'}</b></div>
      {saldoUsado > 0 ? <div className="fila-dato"><span className="muted">Tu saldo</span><b>− {fmtPen(saldoUsado)}</b></div> : null}
      <div className="fila-dato total"><span>Total a pagar</span><b data-testid="total-carrito">{fmtPen(total)}</b></div>
      {saldoUsado > 0 ? <p className="small muted" style={{ margin: '2px 0 0' }}>Por Yape/Plin pagas <b>{fmtPen(aPagar)}</b>{saldo >= total ? ' (nada: tu saldo cubre todo y la compra se confirma al instante)' : ''}.</p> : null}
      <p className="small muted" style={{ marginTop: 8 }}>El vendedor tiene {textoPlazo(precios.ajustes.pagos)} para dejar las cartas en la tienda. Pagas por Yape al número de la app y subes la captura.</p>
      <button className="btn primary grande block" style={{ marginTop: 10 }} disabled={!!conProblema.length || creando || !tiendaSel} onClick={continuar} data-testid="btn-comprar">{creando ? 'Reservando…' : 'Continuar al pago'}</button>
      {!tiendaSel && tiendas && tiendas.length ? <p className="small muted" style={{ marginTop: 6, textAlign: 'center' }}>Elige una tienda de recojo para continuar.</p> : null}
    </div>
  ) : null;

  return (
    <div className="carrito-vista">
      <div className="cabecera-seccion" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>{lineas.length ? `${mercado.unidades} ${mercado.unidades === 1 ? 'carta' : 'cartas'}` : 'Carrito'}</h1>
        {lineas.length && expiraMin ? <span className="small muted">reservadas para ti hasta las <b style={{ color: 'var(--enlace)' }}>{hora(expiraMin)}</b></span> : null}
      </div>
      {!mercado.cargado ? <p className="muted small"><span className="spinner" /> Cargando…</p> : null}
      {mercado.cargado && !lineas.length ? <div className="empty"><div className="big"><Icono n="carrito" tam={44} grosor={1.5} /></div><p><b>Tu carrito está vacío.</b></p><p className="muted">Busca cartas en el <Link href="/app/mercado">Mercado</Link> y pulsa «Agregar al carrito». Las copias quedan reservadas para ti durante 24 horas.</p></div> : null}
      {conProblema.length ? <Aviso tipo="warn">{conProblema.length === 1 ? 'Una publicación de tu carrito ya no está disponible' : `${conProblema.length} publicaciones de tu carrito ya no están disponibles`} (el vendedor la pausó o retiró). Quítala para seguir.</Aviso> : null}
      <div className="carrito-cuerpo">
        <div className="carrito-izquierda">
          <div className="card-list">
            {lineas.map(l => {
              const carta = cat.carta(l.carta_id);
              const set = carta ? cat.setOf(carta) : undefined;
              const mal = l.estado_publicacion !== 'activa' && l.estado_publicacion !== 'reservada';
              const cambioPrecio = Math.abs(l.precio_actual - l.precio_pen) >= 0.01;
              return (
                <div key={l.id} className={`card-row linea-carrito ${mal ? 'dim' : ''}`} style={{ cursor: 'default' }} data-testid="linea-carrito">
                  <Link href={carta ? `/app/carta/${encodeURIComponent(carta.id)}?desde=mercado` : '#'}><Thumb carta={carta} set={set} /></Link>
                  <div className="card-main">
                    <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : 'Carta'}</div>
                    <div className="card-set">{set?.ab || nombreColeccion(set, perfil.idioma_nombres)} · {carta ? numLabel(carta, set) : ''}{l.idioma ? ` · ${l.idioma}` : ''}{l.condicion ? ` · ${l.condicion}` : ''}{l.acabado ? ` · ${l.acabado}` : ''} · <VendedorChip username={l.vendedor} reputacion={reputaciones.get(l.vendedor_id)?.reputacion} corto /></div>
                    {cambioPrecio ? <div className="small warn">El precio cambió: ahora {fmtPen(l.precio_actual)} c/u.</div> : null}
                    {mal ? <div className="small warn">Ya no está disponible.</div> : null}
                    <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
                      <div className="stepper"><button disabled={ocupado === l.id} onClick={() => cambiar(l, l.cantidad - 1)} aria-label="Una copia menos">−</button><input type="number" readOnly value={l.cantidad} aria-label="Cantidad" /><button disabled={ocupado === l.id || l.cantidad >= l.disponibles} onClick={() => cambiar(l, l.cantidad + 1)} aria-label="Una copia más">+</button></div>
                      <span className="small muted">× {fmtPen(l.precio_pen)}</span>
                    </div>
                  </div>
                  <div className="card-side"><b className="precio-oferta">{fmtPen(l.precio_pen * l.cantidad)}</b><button className="btn sm icon quitar" disabled={ocupado === l.id} onClick={() => quitar(l)} aria-label="Quitar del carrito" title="Quitar"><Icono n="basura" tam={18} /><span className="sr-only">Quitar</span></button></div>
                </div>
              );
            })}
          </div>
          {lineas.length ? (
            <div className="panel" style={{ marginTop: 12 }} data-testid="tiendas-carrito">
              <h3 style={{ margin: '0 0 4px' }}>¿Dónde la recoges?</h3>
              <p className="small muted">El vendedor deja las cartas en la tienda que elijas y tú las recoges con un código de retiro. Sin costo de envío.</p>
              {tiendas === null ? <p className="small muted"><span className="spinner" /> Cargando tiendas…</p> : null}
              {tiendas && !tiendas.length ? <Aviso tipo="warn">Todavía no hay tiendas de entrega configuradas. Escríbenos a info@poketcg.pe.</Aviso> : null}
              <div className="opciones-tienda">
                {(tiendas || []).map(t => (
                  <label key={t.id} className={`check grande opcion-tienda ${tiendaSel === t.id ? 'activo' : ''}`} data-testid="tienda-opcion">
                    <input type="radio" name="tienda" checked={tiendaSel === t.id} onChange={() => setTiendaSel(t.id)} />
                    <span className="grow"><b>{t.nombre}</b>{t.distrito ? ` · ${t.distrito}` : ''}<br /><span className="small muted">{t.horario ? `${t.horario} · ` : ''}{t.tarifa_recojo && t.tarifa_recojo > 0 ? `recojo ${fmtPen(t.tarifa_recojo)}` : 'recojo gratis'} · abre: {t.dias_abierto.map(d => DIAS_CORTOS[d]).join(' ')}</span><br /><span className="small muted">{t.direccion}{t.referencia ? ` (${t.referencia})` : ''} · <a href={enlaceMapa(t)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>cómo llegar</a></span></span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {lineas.length && saldo > 0 ? (
            <label className="panel check grande saldo-carrito" style={{ marginTop: 12 }} data-testid="usar-saldo">
              <span className="grow"><b>Usar mi saldo</b><br /><span className="small muted">Tienes {fmtPen(saldo)}</span></span>
              <input type="checkbox" checked={usarSaldo} onChange={e => setUsarSaldo(e.target.checked)} />
            </label>
          ) : null}
        </div>
        <div className="carrito-derecha">{resumen}</div>
      </div>
    </div>
  );
}
