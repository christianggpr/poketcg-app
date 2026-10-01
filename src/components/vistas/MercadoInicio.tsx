'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { destacadosMercado, resumenMercado, type Destacados, type ResumenCarta } from '@/lib/mercado';
import { saldoComprador } from '@/lib/compras';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { FilaMercado, ListaDeseos } from './Mercado';
import { CarruselMercado } from '../CarruselMercado';

/** Inicio del Mercado (Mejoras 1 · B): buscador, accesos y novedades. Los carruseles llegan en el bloque D. */
export function MercadoInicio() {
  const cat = useCatalogo();
  const col = useColeccion();
  const mercado = useMercado();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [recientes, setRecientes] = useState<ResumenCarta[] | null>(null);
  const [destacados, setDestacados] = useState<Destacados | null>(null);
  const [saldo, setSaldo] = useState(0);
  // los carruseles y las novedades se actualizan en vivo (mercado.version cambia con cada aviso Realtime)
  useEffect(() => { resumenMercado({ orden: 'novedad', limite: 8 }).then(setRecientes).catch(() => setRecientes([])); destacadosMercado(12).then(setDestacados).catch(() => setDestacados({ mas_vendidas: [], mayor_precio: [], generado: '' })); }, [mercado.version]);
  useEffect(() => { saldoComprador().then(s => setSaldo(s.saldo)).catch(() => {}); }, []);
  const idsMias = new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x));
  return (
    <div data-testid="mercado-inicio">
      <h2 style={{ margin: 0 }}>🛒 Mercado</h2>
      <p className="small muted">Cartas que otros coleccionistas tienen en venta. Pagas por Yape/Plin o con tu saldo y recoges en una tienda aliada con tu código de retiro; sin cargos al comprador.</p>
      {destacados ? <CarruselMercado titulo="Más vendidas" icono="🔥" items={destacados.mas_vendidas} testid="carrusel-vendidas" vacio="Todavía no hay cartas en venta." /> : <p className="small muted"><span className="spinner" /> Cargando destacados…</p>}
      {destacados ? <CarruselMercado titulo="Cartas de mayor precio" icono="💎" items={destacados.mayor_precio} testid="carrusel-precio" vacio="Todavía no hay cartas en venta." /> : null}
      <form className="search-wrap" style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); router.push(`/app/mercado/buscar${q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''}`); }}>
        <input className="input" placeholder="Buscar en el mercado: nombre, número o colección…" value={q} onChange={e => setQ(e.target.value)} data-testid="mercado-inicio-buscar" />
      </form>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <Link href="/app/mercado/buscar" className="btn sm">🔎 Ver todo lo que hay en venta</Link>
        <Link href="/app/mazos" className="btn sm ghost">🃏 Mazos meta</Link>
        <Link href="/app/carrito" className="btn sm ghost" data-testid="btn-carrito">🛒 Carrito{mercado.unidades ? ` (${mercado.unidades})` : ''}</Link>
        <Link href="/app/compras" className="btn sm ghost">🧾 Mis compras{saldo > 0 ? ` · saldo ${fmtPen(saldo)}` : ''}</Link>
      </div>
      <ListaDeseos abiertaAlInicio />
      <h3 style={{ marginTop: 16 }}>🆕 Recién publicadas</h3>
      {recientes === null ? <p className="small muted"><span className="spinner" /> Consultando…</p> : null}
      {recientes && !recientes.length ? <p className="small muted">Todavía no hay cartas en venta. ¿Tienes repetidas? Ponlas en venta desde tu Bulk.</p> : null}
      <div className="card-list">
        {(recientes || []).map(f => { const c = cat.carta(f.carta_id); if (!c) return null; return <FilaMercado key={f.carta_id} carta={c} resumen={f} tengo={idsMias.has(f.carta_id)} onClick={() => router.push(`/app/carta/${encodeURIComponent(c.id)}#mercado`)} />; })}
      </div>
    </div>
  );
}
