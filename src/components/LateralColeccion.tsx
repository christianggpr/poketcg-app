'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { filtrosDeParams, paramsDeFiltros, type Filtros } from '@/lib/filtros';
import { Buscador, QuisisteDecir } from './Buscador';
import { BotonCamara, irASugerencia } from './Barras';
import { TarjetaFiltros } from './Filtros';
import { useEsPC } from './ui';

const BUSCAR = '/app/buscar';

/**
 * Mejoras 5 · C (maqueta M5-PC-Coleccion): en PC, la columna izquierda de Mi Colección lleva el buscador (con cámara),
 * "¿Quisiste decir…?" y la tarjeta Filtros debajo del precio de la colección. Buscar o cambiar un filtro lleva a los
 * resultados (/app/buscar) con todo en la dirección; en los resultados, escribir o filtrar los actualiza al instante.
 */
export function LateralColeccion() {
  const esPC = useEsPC();
  return esPC ? <LateralColeccionPC /> : null;   // en el celular no existe (evita duplicar el buscador y los filtros ocultos)
}

function LateralColeccionPC() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const enResultados = ruta === BUSCAR;
  const [q, setQ] = useState(enResultados ? params.get('q') || '' : '');
  // en los resultados el texto de la dirección manda (p. ej. "¿Quisiste decir…?" o el buscador de la barra superior)
  useEffect(() => { if (enResultados) { const pq = params.get('q') || ''; if (pq !== q) setQ(pq); } else if (q) setQ(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params, ruta]);
  const [local, setLocal] = useState<Filtros | null>(null);
  useEffect(() => { setLocal(null); }, [params]);
  const f = local ?? (enResultados ? filtrosDeParams(params) : filtrosDeParams(null));
  const irA = (texto: string, nf: Filtros = f) => {
    const p = paramsDeFiltros(nf, { q: texto.trim() });
    const destino = `${BUSCAR}${p.toString() ? '?' + p.toString() : ''}`;
    if (enResultados) router.replace(destino, { scroll: false }); else router.push(destino);
  };
  // lo escrito pasa a los resultados con una pequeña espera (en los resultados, sin cambiar de página)
  useEffect(() => {
    if (!enResultados) return;
    const t = setTimeout(() => { if ((params.get('q') || '') !== q.trim()) irA(q); }, 400);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [q]);
  const cambiarFiltros = (nf: Filtros) => { setLocal(nf); irA(q, nf); };
  return (
    <div className="lateral-buscar" data-testid="lateral-buscar">
      <Buscador value={q} onChange={setQ} onBuscar={t => irA(t)} onElegir={s => router.push(irASugerencia(BUSCAR, s))}
        placeholder="Buscar en mi colección" aria-label="Buscar en mi colección" className="con-camara" limpiar derecha={<BotonCamara />} testid="buscador-lateral" inputTestid="buscar-lateral-input" />
      <QuisisteDecir q={enResultados ? q : ''} onElegir={c => { setQ(c.consulta); irA(c.consulta); }} />
      <TarjetaFiltros ambito="coleccion" f={f} onChange={cambiarFiltros} className="filtros-lateral" />
    </div>
  );
}
