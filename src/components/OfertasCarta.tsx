'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Carta } from '@/lib/catalogo';
import { ofertasDe, type Oferta } from '@/lib/mercado';
import { fmtPen } from '@/lib/precios-core';
import { reputacionesDe, type VendedorPublico } from '@/lib/reputacion';
import { VendedorChip } from './Vendedor';
import { useMercado } from './MercadoProvider';
import { usePerfil } from './PerfilProvider';
import { useToast } from './Toast';

/** "Disponible en la red": ofertas de una carta con botón para agregar al carrito (tiempo real). */
export function OfertasCarta({ carta }: { carta: Carta }) {
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const toast = useToast();
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null);
  const [error, setError] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [vendedores, setVendedores] = useState<Map<string, VendedorPublico>>(new Map());

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

  async function agregar(o: Oferta) {
    setOcupado(o.id);
    const r = await mercado.reservar(o.id, cantidades[o.id] || 1);
    setOcupado(null);
    if (r.ok) toast(`Reservada en tu carrito (${r.cantidad} ${r.cantidad === 1 ? 'copia' : 'copias'})`, 'ok');
    else toast(r.error || 'No se pudo reservar', 'danger');
  }

  return (
    <>
      <h3><span>Disponible en la red</span>{ofertas ? <span className="count">{copias}</span> : null}</h3>
      {error ? <p className="small" style={{ color: 'var(--danger)' }}>No se pudo consultar el mercado: {error}</p> : null}
      {!ofertas && !error ? <p className="small muted">Consultando…</p> : null}
      {ofertas && !ofertas.length ? <p className="small muted" data-testid="sin-ofertas">Nadie la tiene en venta ahora mismo. Cuando alguien la publique aparecerá aquí.</p> : null}
      {ofertas && ofertas.length ? <p className="small" data-testid="resumen-ofertas"><b>{copias} {copias === 1 ? 'copia' : 'copias'}</b> desde <b>{fmtPen(desde!)}</b> · {new Set(ofertas.map(o => o.vendedor)).size} {new Set(ofertas.map(o => o.vendedor)).size === 1 ? 'vendedor' : 'vendedores'}</p> : null}
      <div className="card-list">
        {(ofertas || []).map(o => {
          const mia = o.vendedor_id === perfil.id;
          const linea = enCarrito.get(o.id);
          const n = Math.min(o.disponibles, cantidades[o.id] || 1);
          return (
            <div key={o.id} className="card-row" style={{ cursor: 'default' }} data-testid="oferta">
              <div className="card-main">
                <div className="card-name"><b>{fmtPen(o.precio_pen)}</b> <span className="muted small">c/u</span> {o.acabado ? <span className="pill">{o.acabado}</span> : null} {o.idioma ? <span className="pill">{o.idioma}</span> : null} {o.condicion ? <span className="pill">{o.condicion}</span> : null}{mia ? <span className="pill primary" style={{ marginLeft: 4 }}>tu publicación</span> : null}</div>
                <div className="card-set">Vende <VendedorChip username={o.vendedor} reputacion={vendedores.get(o.vendedor_id)?.reputacion} /> · {o.disponibles} {o.disponibles === 1 ? 'copia disponible' : 'copias disponibles'}{o.tipo_precio === 'defecto' ? <span className="faint"> · precio por defecto</span> : null}</div>
                {(o.fotos || []).length ? <div className="row" style={{ gap: 6, marginTop: 6 }}>{o.fotos.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Foto real de la carta" className="foto-mini" /></a>)}</div> : null}
                {mia ? <div className="small muted" style={{ marginTop: 4 }}>No puedes comprar tus propias cartas. <Link href="/app/ventas">Ver en Mis ventas</Link></div> : (
                  <div className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center' }}>
                    {o.disponibles > 1 ? <div className="stepper"><button onClick={() => setCantidades(x => ({ ...x, [o.id]: Math.max(1, n - 1) }))}>−</button><input type="number" readOnly value={n} aria-label="Cantidad" /><button onClick={() => setCantidades(x => ({ ...x, [o.id]: Math.min(o.disponibles, n + 1) }))}>+</button></div> : null}
                    <button className="btn sm primary" disabled={ocupado === o.id} onClick={() => agregar(o)} data-testid="btn-agregar">{linea ? `🛒 En tu carrito (${linea.cantidad}) · cambiar` : '🛒 Agregar al carrito'}</button>
                    {linea ? <Link href="/app/carrito" className="btn sm ghost">Ver carrito</Link> : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
