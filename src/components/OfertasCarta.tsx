'use client';
import { Icono } from './Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Carta } from '@/lib/catalogo';
import { ofertasDe, type Oferta } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { ventasCarta, type VentaPub } from '@/lib/publico';
import { reputacionesDe, type VendedorPublico } from '@/lib/reputacion';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fechaDia } from '@/lib/compras';
import { VendedorChip } from './Vendedor';
import { useMercado } from './MercadoProvider';
import { usePerfil } from './PerfilProvider';
import { useToast } from './Toast';
import { useEsPC } from './ui';

const IDIOMAS_FILTRO = ['EN', 'ES', 'JP'];

/** Ofertas de una carta en el mercado (tiempo real): filtros de idioma y "Solo NM", tarjetas en celular y tabla en PC, con "Agregar al carrito". */
export function OfertasCarta({ carta }: { carta: Carta }) {
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const toast = useToast();
  const esPC = useEsPC();
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [error, setError] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Map<string, VendedorPublico>>(new Map());
  const [idioma, setIdioma] = useState('');
  const [soloNM, setSoloNM] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cargar = () => ofertasDe(carta.id).then(o => { if (vivo) { setOfertas(o); setError(''); reputacionesDe(o.map(x => x.vendedor_id)).then(m => { if (vivo) setVendedores(m); }); } }).catch(e => { if (vivo) setError((e as Error).message); });
    cargar();
    // tiempo real: cuando cambia una publicación de esta carta, se vuelve a consultar
    const baja = mercado.suscribir(id => { if (!id || id === carta.id) cargar(); });
    return () => { vivo = false; baja(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [carta.id, mercado.version]);

  const enCarrito = new Map(mercado.carrito.filter(l => l.carta_id === carta.id).map(l => [l.publicacion_id, l]));
  const copias = (ofertas || []).reduce((n, o) => n + o.disponibles, 0);
  const desde = ofertas && ofertas.length ? ofertas[0].precio_pen : null;
  const nVendedores = new Set((ofertas || []).map(o => o.vendedor)).size;
  const idiomas = useMemo(() => [...new Set([...IDIOMAS_FILTRO, ...(ofertas || []).map(o => o.idioma).filter(Boolean)])], [ofertas]);
  const visibles = (ofertas || []).filter(o => (!idioma || o.idioma === idioma) && (!soloNM || o.condicion === 'NM'));

  async function agregar(o: Oferta) {
    setOcupado(o.id);
    const r = await mercado.reservar(o.id, cantidades[o.id] || 1);
    setOcupado(null);
    if (r.ok) toast(`Reservada en tu carrito (${r.cantidad} ${r.cantidad === 1 ? 'copia' : 'copias'})`, 'ok');
    else toast(r.error || 'No se pudo reservar', 'danger');
  }
  const Stepper = ({ o, n }: { o: Oferta; n: number }) => o.disponibles > 1 ? (
    <div className="stepper">
      <button type="button" onClick={() => setCantidades(x => ({ ...x, [o.id]: Math.max(1, n - 1) }))} aria-label="Una copia menos">−</button>
      <input type="number" readOnly value={n} aria-label="Cantidad" />
      <button type="button" onClick={() => setCantidades(x => ({ ...x, [o.id]: Math.min(o.disponibles, n + 1) }))} aria-label="Una copia más">+</button>
    </div>
  ) : null;
  const BotonAgregar = ({ o }: { o: Oferta }) => { const linea = enCarrito.get(o.id); return (
    <>
      <button className="btn sm primary" disabled={ocupado === o.id} onClick={() => agregar(o)} data-testid="btn-agregar"><Icono n="carrito" /> {linea ? `En tu carrito (${linea.cantidad}) · cambiar` : esPC ? 'Agregar' : 'Agregar al carrito'}</button>
      {linea ? <Link href="/app/carrito" className="btn sm ghost">Ver carrito</Link> : null}
    </>
  ); };

  return (
    <section className="ofertas" id="mercado">
      <div className="cabecera-seccion" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{ofertas ? `${ofertas.length} ${ofertas.length === 1 ? 'oferta' : 'ofertas'}` : 'Ofertas'} <span className="muted" style={{ fontFamily: 'var(--fuente-texto)', fontSize: 13, fontWeight: 700 }}>· más barata primero</span></h3>
        {ofertas && ofertas.length ? (
          <div className="seg filtros-ofertas" data-testid="filtros-ofertas">
            <button className={!idioma ? 'active' : ''} onClick={() => setIdioma('')}>Todos</button>
            {idiomas.map(l => <button key={l} className={idioma === l ? 'active' : ''} onClick={() => setIdioma(l)}>{l}</button>)}
            <button className={soloNM ? 'active' : ''} onClick={() => setSoloNM(v => !v)} aria-pressed={soloNM}>Solo NM</button>
          </div>
        ) : null}
      </div>
      {error ? <p className="small" style={{ color: 'var(--peligro-texto)' }}>No se pudo consultar el mercado: {error}</p> : null}
      {!ofertas && !error ? <p className="small muted">Consultando…</p> : null}
      {ofertas && !ofertas.length ? <p className="small muted" data-testid="sin-ofertas">Nadie la tiene en venta ahora mismo. Cuando alguien la publique aparecerá aquí.</p> : null}
      {ofertas && ofertas.length ? <p className="small muted" data-testid="resumen-ofertas"><b>{copias} {copias === 1 ? 'copia' : 'copias'}</b> desde <b>{fmtPen(desde!)}</b> · {nVendedores} {nVendedores === 1 ? 'vendedor' : 'vendedores'}{visibles.length !== ofertas.length ? ` · ${visibles.length} con este filtro` : ''}</p> : null}
      {esPC && visibles.length ? (
        <div className="tabla-scroll"><table className="tabla tabla-ofertas" data-testid="tabla-ofertas">
          <thead><tr><th>Vendedor</th><th>Idioma</th><th>Estado</th><th>Foto real</th><th>Precio</th><th /></tr></thead>
          <tbody>
            {visibles.map(o => { const mia = o.vendedor_id === perfil.id; const n = Math.min(o.disponibles, cantidades[o.id] || 1); return (
              <tr key={o.id} data-testid="oferta">
                <td><VendedorChip username={o.vendedor} reputacion={vendedores.get(o.vendedor_id)?.reputacion} />{mia ? <span className="pill primary" style={{ marginLeft: 6 }}>tu publicación</span> : null}<div className="small muted">{o.disponibles} {o.disponibles === 1 ? 'copia' : 'copias'}{o.acabado ? ` · ${o.acabado}` : ''}{o.tipo_precio === 'defecto' ? ' · precio por defecto' : ''}</div></td>
                <td>{o.idioma ? <span className={`pill ${o.idioma === 'JP' ? 'jp' : 'info'}`}>{o.idioma}</span> : '—'}</td>
                <td>{o.condicion ? <span className={`pill ${o.condicion === 'NM' ? 'ok' : ''}`}>{o.condicion}</span> : '—'}</td>
                <td>{(o.fotos || []).length ? <span className="row" style={{ gap: 4 }}>{o.fotos.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Foto real de la carta" className="foto-mini" /></a>)}</span> : <span className="muted">—</span>}</td>
                <td><b className="precio-oferta">{fmtPen(o.precio_pen)}</b></td>
                <td>{mia ? <span className="small muted">No puedes comprar tus propias cartas. <Link href="/app/ventas">Ver en Mis ventas</Link></span> : <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><Stepper o={o} n={n} /><BotonAgregar o={o} /></div>}</td>
              </tr>
            ); })}
          </tbody>
        </table></div>
      ) : null}
      {!esPC && visibles.length ? (
        <div className="card-list">
          {visibles.map(o => { const mia = o.vendedor_id === perfil.id; const n = Math.min(o.disponibles, cantidades[o.id] || 1); return (
            <div key={o.id} className="card-row oferta-tarjeta" style={{ cursor: 'default' }} data-testid="oferta">
              <div className="card-main">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="card-name"><VendedorChip username={o.vendedor} reputacion={vendedores.get(o.vendedor_id)?.reputacion} />{mia ? <span className="pill primary">tu publicación</span> : null}</div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{o.idioma ? <span className={`pill ${o.idioma === 'JP' ? 'jp' : 'info'}`}>{o.idioma}</span> : null}{o.condicion ? <span className={`pill ${o.condicion === 'NM' ? 'ok' : ''}`}>{o.condicion}</span> : null}{o.acabado ? <span className="pill">{o.acabado}</span> : null}{(o.fotos || []).length ? <span className="pill"><Icono n="camara" tam={12} /> Con foto real</span> : null}</div>
                  </div>
                  <div className="precio-oferta">{fmtPen(o.precio_pen)}<div className="small muted" style={{ textAlign: 'right', fontWeight: 700 }}>{o.disponibles} {o.disponibles === 1 ? 'copia' : 'copias'}</div></div>
                </div>
                {(o.fotos || []).length ? <div className="row" style={{ gap: 6, marginTop: 6 }}>{o.fotos.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Foto real de la carta" className="foto-mini" /></a>)}</div> : null}
                {mia ? <div className="small muted" style={{ marginTop: 6 }}>No puedes comprar tus propias cartas. <Link href="/app/ventas">Ver en Mis ventas</Link></div> : (
                  <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Stepper o={o} n={n} />
                    <BotonAgregar o={o} />
                  </div>
                )}
              </div>
            </div>
          ); })}
        </div>
      ) : null}
      {ofertas && ofertas.length && !visibles.length ? <p className="small muted">Ninguna oferta coincide con el filtro.</p> : null}
      <UltimasVentas cartaId={carta.id} />
    </section>
  );
}

/** Últimas ventas entregadas de esta carta en la red (vista pública `ventas_publicas`). */
function UltimasVentas({ cartaId }: { cartaId: string }) {
  const [ventas, setVentas] = useState<VentaPub[] | null>(null);
  useEffect(() => { let vivo = true; ventasCarta(supabaseBrowser(), cartaId, 8).then(v => { if (vivo) setVentas(v); }).catch(() => { if (vivo) setVentas([]); }); return () => { vivo = false; }; }, [cartaId]);
  if (!ventas || !ventas.length) return null;
  return (
    <div className="panel ultimas-ventas" data-testid="ultimas-ventas">
      <h4 style={{ margin: 0 }}>Últimas ventas en la red</h4>
      <div className="lista-ventas">
        {ventas.map((v, i) => <span key={i} className="venta-red small muted">{fechaDia(v.entregada_en.slice(0, 10))} · {v.idioma || '—'} · {v.condicion || '—'}{v.acabado ? ` · ${v.acabado}` : ''} · <b>{fmtPen(v.precio_pen)}</b>{v.cantidad > 1 ? ` ×${v.cantidad}` : ''}</span>)}
      </div>
    </div>
  );
}
