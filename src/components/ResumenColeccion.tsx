'use client';
import { useMemo } from 'react';
import { fmtPen } from '@/lib/precios-core';
import { totalCartas } from '@/lib/coleccion';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePedirPrecios } from './Precio';
import { usePrecios } from './PreciosProvider';

/** Precio de mi colección = Σ precio por defecto (máx(piso, mercado)) × cantidad, en soles; más cartas y distintas. */
export function usePrecioColeccion() {
  const cat = useCatalogo();
  const col = useColeccion();
  const precios = usePrecios();
  const ids = useMemo(() => [...new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x))], [col.entradas]);
  usePedirPrecios(ids);
  const pen = useMemo(() => {
    let t = 0;
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c || c.sd) continue;
      t += precios.precioDefecto(c, e.acabado).pen * e.cantidad;
    }
    return Math.round(t * 100) / 100;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [col.entradas, cat, precios.version]);
  return { pen, cargando: precios.version === 0 && precios.cargando, cartas: totalCartas(col.entradas), distintas: col.entradas.length };
}

/** Tarjeta "Precio de mi colección" con cartas y distintas (Main / menú lateral de PC). */
export function ResumenColeccion({ className = '' }: { className?: string }) {
  const r = usePrecioColeccion();
  return (
    <div className={`panel resumen-coleccion ${className}`} data-testid="resumen-coleccion">
      <div className="grow">
        <div className="small muted">Precio de mi colección</div>
        <div className="precio-grande" data-testid="precio-coleccion">{r.cargando ? '…' : fmtPen(r.pen)}</div>
      </div>
      <div className="small muted resumen-cifras"><span className="cifra">{r.cartas.toLocaleString('es-PE')} cartas</span><span className="cifra">{r.distintas.toLocaleString('es-PE')} distintas</span></div>
    </div>
  );
}
