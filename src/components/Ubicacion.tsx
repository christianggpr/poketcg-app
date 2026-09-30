'use client';
import type { Entrada, Ubicacion } from '@/lib/coleccion';
import { coleccionEntrada, nombreEntrada, numeroEntrada } from '@/lib/coleccion';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';

/** Chip "📦 Caja 2 #37 de 120" */
export function LocChip({ loc, corto }: { loc: Ubicacion | null; corto?: boolean }) {
  if (!loc) return <span className="loc none">Sin ubicación</span>;
  return (
    <span className="loc" title={`Caja ${loc.caja.nombre}, posición ${loc.idx} de ${loc.total}`}>
      📦 {loc.caja.nombre} <span className="pos">#{loc.idx}</span>{corto ? null : <span className="faint"> de {loc.total}</span>}
    </span>
  );
}

/** Tarjeta "Colócala aquí": caja, posición y vecinas. */
export function Colocacion({ entrada, loc, compacta }: { entrada: Entrada; loc: Ubicacion | null; compacta?: boolean }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  if (!loc) return null;
  const idioma = perfil.idioma_nombres;
  const vecina = (e: Entrada | null, label: string) => (
    <div className="neighbor">
      <span className="faint">{label}</span>
      {e ? <><b>{numeroEntrada(cat, e)} {nombreEntrada(cat, e, idioma)}</b><span className="muted">{coleccionEntrada(cat, e, idioma)}</span></> : <><b>—</b><span className="muted">{label === 'Antes' ? 'inicio de la caja' : 'final de la caja'}</span></>}
    </div>
  );
  return (
    <div className="placement" style={{ marginTop: 12 }}>
      <div className="small" style={{ fontWeight: 700, opacity: 0.8 }}>{compacta ? 'Ubicación actual' : '¡Guardada! Colócala aquí:'}</div>
      <div className="where">📦 {loc.caja.nombre} · posición {loc.idx} de {loc.total}</div>
      <div className="small">Caja {loc.ordinalCaja}ª de izquierda a derecha · sección <b>{loc.seccion}</b>{loc.caja.modo === 'manual' ? ' · orden manual' : ''}</div>
      <div className="between">
        {vecina(loc.anterior, 'Antes')}
        <div className="me">{numeroEntrada(cat, entrada)}<br />{nombreEntrada(cat, entrada, idioma)}</div>
        {vecina(loc.siguiente, 'Después')}
      </div>
    </div>
  );
}
