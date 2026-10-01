'use client';
import { useEffect } from 'react';
import type { Carta } from '@/lib/catalogo';
import { fmtPen, fmtUsd } from '@/lib/precios-core';
import { usePrecios } from './PreciosProvider';

/**
 * Precio de una carta en soles (precio por defecto del mercado PokéTCG = máx(piso, precio de mercado)),
 * multiplicado por la cantidad. Pide el precio si aún no está en caché.
 */
export function Precio({ carta, acabado = '', cantidad = 1, corto = true }: { carta: Carta | null | undefined; acabado?: string; cantidad?: number; corto?: boolean }) {
  const precios = usePrecios();
  useEffect(() => { if (carta && !carta.sd && !carta.sinTcgdex) precios.pedir([carta.id]); }, [carta, precios]);
  if (!carta || carta.sd) return null;
  const d = precios.precioDefecto(carta, acabado);
  const total = d.pen * cantidad;
  const m = d.mercado;
  const titulo = m
    ? `Mercado: ${fmtPen(m.pen)} (${m.label}${m.approx ? ' aprox.' : ''} · ${m.src}${m.usd != null ? ` ${fmtUsd(m.usd)}` : ''}${m.eur != null ? ` €${m.eur.toFixed(2)}` : ''})${d.origen === 'piso' ? ` · se aplica el piso de ${fmtPen(d.piso)}` : ''}${cantidad > 1 ? ` · ${cantidad} × ${fmtPen(d.pen)}` : ''}`
    : `Sin precio de mercado: se aplica el piso de ${fmtPen(d.piso)}${cantidad > 1 ? ` · ${cantidad} × ${fmtPen(d.pen)}` : ''}`;
  if (corto) return <span className={`price ${d.origen === 'piso' ? 'piso' : ''}`} title={titulo}>{fmtPen(total)}</span>;
  return (
    <span className={`price ${d.origen === 'piso' ? 'piso' : ''}`} title={titulo}>
      {fmtPen(total)}{cantidad > 1 ? <span className="faint"> ({cantidad} × {fmtPen(d.pen)})</span> : null}
      <span className="faint"> {m ? `${m.label}${m.approx ? ' ≈' : ''}` : 'piso'}</span>
    </span>
  );
}

/** Pide en lote los precios de una lista de cartas (para listas largas). */
export function usePedirPrecios(ids: string[]) {
  const precios = usePrecios();
  const clave = ids.join(',');
  useEffect(() => { if (ids.length) precios.pedir(ids); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clave, precios.pedir]);
}
