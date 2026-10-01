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
  const [recientes, setRecientes] = useState<ResumenCarta[] | null>(null);
  const [destacados, setDestacados] = useState<Destacados | null>(null);
  const [saldo, setSaldo] = useState(0);
  // los carruseles y las novedades se actualizan en vivo (mercado.version cambia con cada aviso Realtime)
  useEffect(() => { resumenMercado({ orden: 'novedad', limite: 8 }).then(setRecientes).catch(() => setRecientes([])); destacadosMercado(12).then(setDestacados).catch(() => setDestacados({ mas_vendidas: [], mayor_precio: [], generado: '' })); }, [mercado.version]);
  useEffect(() => { saldoComprador().then(s => setSaldo(s.saldo)).catch(() => {}); }, []);
  const idsMias = new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x));
  return (
    <div data-testid="mercado-inicio">
      {destacados ? <CarruselMercado titulo="Más vendidas" icono="fuego" nota={destacados.mas_vendidas.some(d => (d.vendidas || 0) > 0) ? 'últimos 30 días' : 'sin ventas en 30 días: las más publicadas'} items={destacados.mas_vendidas} testid="carrusel-vendidas" vacio="Todavía no hay cartas en venta." /> : <p className="small muted"><span className="spinner" /> Cargando destacados…</p>}
      {destacados ? <CarruselMercado titulo="Mayor precio" icono="gema" nota="disponibles ahora" items={destacados.mayor_precio} testid="carrusel-precio" vacio="Todavía no hay cartas en venta." /> : null}
      <div className="bloque recien">
        <h3><span>Recién publicadas</span><Link href="/app/mercado/buscar" className="small">Ver todo</Link></h3>
        {recientes === null ? <p className="small muted"><span className="spinner" /> Consultando…</p> : null}
        {recientes && !recientes.length ? <p className="small muted">Todavía no hay cartas en venta. ¿Tienes repetidas? Ponlas en venta desde tu Bulk.</p> : null}
        <div className="card-list">
          {(recientes || []).map(f => { const c = cat.carta(f.carta_id); if (!c) return null; return <FilaMercado key={f.carta_id} carta={c} resumen={f} tengo={idsMias.has(f.carta_id)} onClick={() => router.push(`/app/carta/${encodeURIComponent(c.id)}?desde=mercado#mercado`)} />; })}
        </div>
      </div>
      <ListaDeseos abiertaAlInicio />
      {saldo > 0 ? <p className="small muted" style={{ marginTop: 12 }}>Tienes <b>{fmtPen(saldo)}</b> de saldo para tu próxima compra. <Link href="/app/compras">Ver mis compras</Link></p> : null}
    </div>
  );
}
