'use client';
import { useEffect } from 'react';
import type { Carta } from '@/lib/catalogo';
import { fmtUsd } from '@/lib/precios-core';
import { usePrecios } from './PreciosProvider';

/** Precio de una carta según el acabado; pide el precio si aún no está en caché. */
export function Precio({ carta, acabado = '', cantidad = 1, corto = true }: { carta: Carta | null | undefined; acabado?: string; cantidad?: number; corto?: boolean }) {
  const precios = usePrecios();
  useEffect(() => { if (carta && !carta.sd) precios.pedir([carta.id]); }, [carta, precios]);
  if (!carta || carta.sd) return null;
  const v = precios.valor(carta, acabado);
  if (!v) return <span className="price empty" />;
  const total = v.usd * cantidad;
  const titulo = `${v.label}${v.approx ? ' (aprox.)' : ''} · ${v.src}${cantidad > 1 ? ` · ${cantidad} × ${fmtUsd(v.usd)}` : ''}`;
  if (corto) return <span className="price" title={titulo}>{fmtUsd(total)}</span>;
  return <span className="price" title={titulo}>{fmtUsd(total)}{cantidad > 1 ? <span className="faint"> ({cantidad} × {fmtUsd(v.usd)})</span> : null} <span className="faint">{v.label}{v.approx ? ' ≈' : ''}</span></span>;
}

/** Pide en lote los precios de una lista de cartas (para listas largas). */
export function usePedirPrecios(ids: string[]) {
  const precios = usePrecios();
  const clave = ids.join(',');
  useEffect(() => { if (ids.length) precios.pedir(ids); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clave, precios.pedir]);
}
