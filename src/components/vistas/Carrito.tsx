'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { crearPago, tiendasActivas, DIAS_CORTOS, type Tienda } from '@/lib/compras';
import type { LineaCarrito } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

/** Carrito: reservas activas (24 h); "Comprar" elige la tienda de entrega y crea el pago por Yape. */
export function Carrito() {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const precios = usePrecios();
  const toast = useToast();
  const router = useRouter();
  const [comprar, setComprar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const comision = precios.ajustes.comision;
  const lineas = mercado.carrito;
  const total = mercado.total;
  const vendedores = [...new Set(lineas.map(l => l.vendedor))];
  const conProblema = lineas.filter(l => l.estado_publicacion !== 'activa' && l.estado_publicacion !== 'reservada');

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
  const hora = (iso: string) => new Date(iso).toLocaleString('es-PE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <p className="small"><Link href="/app/mercado">← Mercado</Link></p>
      <h2 style={{ marginTop: 0 }}>🛒 Tu carrito</h2>
      {!mercado.cargado ? <p className="muted small"><span className="spinner" /> Cargando…</p> : null}
      {mercado.cargado && !lineas.length ? <div className="empty"><div className="big">🛒</div><p><b>Tu carrito está vacío.</b></p><p className="muted">Busca cartas en el <Link href="/app/mercado">Mercado</Link> y pulsa «Agregar al carrito». Las copias quedan reservadas para ti durante 24 horas.</p></div> : null}
      {conProblema.length ? <Aviso tipo="warn">{conProblema.length === 1 ? 'Una publicación de tu carrito ya no está disponible' : `${conProblema.length} publicaciones de tu carrito ya no están disponibles`} (el vendedor la pausó o retiró). Quítala para seguir.</Aviso> : null}
      <div className="card-list" style={{ marginTop: 10 }}>
        {lineas.map(l => {
          const carta = cat.carta(l.carta_id);
          const set = carta ? cat.setOf(carta) : undefined;
          const mal = l.estado_publicacion !== 'activa' && l.estado_publicacion !== 'reservada';
          const cambioPrecio = Math.abs(l.precio_actual - l.precio_pen) >= 0.01;
          return (
            <div key={l.id} className={`card-row ${mal ? 'dim' : ''}`} style={{ cursor: 'default' }} data-testid="linea-carrito">
              <Link href={carta ? `/app/carta/${encodeURIComponent(carta.id)}` : '#'}><Thumb carta={carta} set={set} /></Link>
              <div className="card-main">
                <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : 'Carta'}</div>
                <div className="card-set">{nombreColeccion(set, perfil.idioma_nombres)} {carta ? <span className="num">{numLabel(carta, set)}</span> : null}{l.acabado ? <span className="pill">{l.acabado}</span> : null}{l.idioma ? <span className="pill">{l.idioma}</span> : null}{l.condicion ? <span className="pill">{l.condicion}</span> : null}</div>
                <div className="small">Vende <b>@{l.vendedor}</b> · {fmtPen(l.precio_pen)} c/u{cambioPrecio ? <span className="muted"> (ahora {fmtPen(l.precio_actual)})</span> : null} · reservada hasta {hora(l.expira)}</div>
                {mal ? <div className="small" style={{ color: 'var(--warn)' }}>Ya no está disponible.</div> : null}
                <div className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <div className="stepper"><button disabled={ocupado === l.id} onClick={() => cambiar(l, l.cantidad - 1)}>−</button><input type="number" readOnly value={l.cantidad} aria-label="Cantidad" /><button disabled={ocupado === l.id || l.cantidad >= l.disponibles} onClick={() => cambiar(l, l.cantidad + 1)}>+</button></div>
                  <span className="small muted">de {l.disponibles} disponibles</span>
                  <span className="grow" />
                  <button className="btn sm ghost" disabled={ocupado === l.id} onClick={() => quitar(l)}>Quitar</button>
                </div>
              </div>
              <div className="card-side"><span className="price">{fmtPen(l.precio_pen * l.cantidad)}</span></div>
            </div>
          );
        })}
      </div>
      {lineas.length ? (
        <div className="panel" style={{ marginTop: 12 }} data-testid="resumen-carrito">
          <div className="row" style={{ justifyContent: 'space-between' }}><span>{mercado.unidades} {mercado.unidades === 1 ? 'carta' : 'cartas'} de {vendedores.length} {vendedores.length === 1 ? 'vendedor' : 'vendedores'}</span><span>{fmtPen(total)}</span></div>
          <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>Comisión de PokéTCG ({Math.round(comision * 100)} %, la paga el vendedor)</span><span>{fmtPen(Math.round(total * comision * 100) / 100)}</span></div>
          <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800, fontSize: 18, marginTop: 6 }}><span>Total</span><span data-testid="total-carrito">{fmtPen(total)}</span></div>
          <button className="btn primary block" style={{ marginTop: 10 }} disabled={!!conProblema.length} onClick={() => setComprar(true)} data-testid="btn-comprar">Comprar</button>
          <p className="small muted" style={{ marginTop: 8 }}>Pagas por Yape al número de la app y subes la foto del comprobante. Recoges tus cartas en la tienda que elijas; el vendedor las deja ahí a más tardar el sábado.</p>
        </div>
      ) : null}
      {comprar ? <ElegirTienda total={total} onClose={() => setComprar(false)} onListo={id => { mercado.recargarCarrito(); router.push(`/app/compras/${id}`); }} /> : null}
    </div>
  );
}

/** Paso 1 de la compra: elegir la tienda/sede donde recoger. */
function ElegirTienda({ total, onClose, onListo }: { total: number; onClose: () => void; onListo: (pagoId: string) => void }) {
  const toast = useToast();
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const [sel, setSel] = useState<string>('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { tiendasActivas().then(t => { setTiendas(t); if (t.length === 1) setSel(t[0].id); }).catch(() => setTiendas([])); }, []);
  async function confirmar() {
    if (!sel) { toast('Elige una tienda', 'danger'); return; }
    setOcupado(true);
    const r = await crearPago(sel);
    setOcupado(false);
    if (!r.ok || !r.pago_id) { toast(r.error || 'No se pudo iniciar la compra', 'danger', 4000); return; }
    onListo(r.pago_id);
  }
  return (
    <Sheet titulo="¿Dónde recoges tus cartas?" onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || !sel} onClick={confirmar} data-testid="btn-confirmar-tienda">{ocupado ? 'Reservando…' : `Continuar al pago (${fmtPen(total)})`}</button></>}>
      <p className="small muted">El vendedor deja las cartas en la tienda que elijas y tú las recoges con un código de retiro. Sin costo de envío.</p>
      {tiendas === null ? <p className="small muted"><span className="spinner" /> Cargando tiendas…</p> : null}
      {tiendas && !tiendas.length ? <Aviso tipo="warn">Todavía no hay tiendas de entrega configuradas. Escríbenos a info@poketcg.pe.</Aviso> : null}
      <div className="stack" style={{ marginTop: 8 }}>
        {(tiendas || []).map(t => (
          <label key={t.id} className="check" style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 10 }} data-testid="tienda-opcion">
            <input type="radio" name="tienda" checked={sel === t.id} onChange={() => setSel(t.id)} />
            <span><b>{t.nombre}</b>{t.distrito ? ` · ${t.distrito}` : ''}<br /><span className="small muted">{t.direccion}{t.referencia ? ` (${t.referencia})` : ''}{t.horario ? ` · ${t.horario}` : ''} · abre: {t.dias_abierto.map(d => DIAS_CORTOS[d]).join(' ')}</span></span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}
