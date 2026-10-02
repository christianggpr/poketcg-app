'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { destacadosMercado, type Destacados } from '@/lib/mercado';
import { saldoComprador } from '@/lib/compras';
import { fmtPen } from '@/lib/precios-core';
import { useMercado } from '../MercadoProvider';
import { CarruselMercado } from '../CarruselMercado';

/**
 * Destacados del Mercado (Mejoras 1 · D): carruseles "Más vendidas" y "Mayor precio" que se mueven solos, y el saldo disponible.
 * Mejoras 5 · D: van arriba de la cuadrícula de Explorar cuando no hay búsqueda ni filtros (antes eran el "Inicio" del Mercado;
 * "Recién publicadas" ya es la propia cuadrícula ordenada por más nuevas).
 */
export function DestacadosMercado() {
  const mercado = useMercado();
  const [destacados, setDestacados] = useState<Destacados | null>(null);
  const [saldo, setSaldo] = useState(0);
  // los carruseles se actualizan en vivo (mercado.version cambia con cada aviso Realtime)
  useEffect(() => { destacadosMercado(12).then(setDestacados).catch(() => setDestacados({ mas_vendidas: [], mayor_precio: [], generado: '' })); }, [mercado.version]);
  useEffect(() => { saldoComprador().then(s => setSaldo(s.saldo)).catch(() => {}); }, []);
  return (
    <div className="destacados-mercado" data-testid="mercado-inicio">
      {destacados ? <CarruselMercado titulo="Más vendidas" icono="fuego" nota={destacados.mas_vendidas.some(d => (d.vendidas || 0) > 0) ? 'últimos 30 días' : 'sin ventas en 30 días: las más publicadas'} items={destacados.mas_vendidas} testid="carrusel-vendidas" vacio="Todavía no hay cartas en venta." /> : <p className="small muted"><span className="spinner" /> Cargando destacados…</p>}
      {destacados ? <CarruselMercado titulo="Mayor precio" icono="gema" nota="disponibles ahora" items={destacados.mayor_precio} testid="carrusel-precio" vacio="Todavía no hay cartas en venta." /> : null}
      {saldo > 0 ? <p className="small muted" style={{ marginTop: 8 }}>Tienes <b>{fmtPen(saldo)}</b> de saldo para tu próxima compra. <Link href="/app/compras">Ver mis compras</Link></p> : null}
    </div>
  );
}
