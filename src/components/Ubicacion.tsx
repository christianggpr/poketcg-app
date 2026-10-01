'use client';
import type { Donde, Entrada } from '@/lib/coleccion';
import { coleccionEntrada, nombreEntrada, numeroEntrada } from '@/lib/coleccion';
import { nombreColeccion } from '@/lib/catalogo';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';

/** Chip de ubicación: "📦 Bulk 2 #37 de 120", "📒 Álbum PRE EN · 123/131" o "📒 Álbum «Charmander» pág. 2 · bolsillo 5". */
export function LocChip({ loc, corto }: { loc: Donde | null; corto?: boolean }) {
  const { perfil } = usePerfil();
  if (!loc) return <span className="loc none">Sin ubicación</span>;
  if (loc.tipo === 'coleccion') return <span className="loc album" title={`Álbum de la colección ${nombreColeccion(loc.set, perfil.idioma_nombres, true)} en ${loc.idioma}, casilla ${loc.numero}`}>📒 {corto ? (loc.set?.ab || nombreColeccion(loc.set, perfil.idioma_nombres, true)) : nombreColeccion(loc.set, perfil.idioma_nombres, true)} {loc.idioma} <span className="pos">{loc.numero}</span></span>;
  if (loc.tipo === 'album') return <span className="loc album" title={`Álbum «${loc.album.nombre}», página ${loc.pagina}, bolsillo ${loc.bolsillo}`}>📒 {loc.album.nombre} <span className="pos">p.{loc.pagina} · {loc.bolsillo}</span></span>;
  return (
    <span className="loc" title={`${loc.caja.nombre}, posición ${loc.idx} de ${loc.total}`}>
      📦 {loc.caja.nombre} <span className="pos">#{loc.idx}</span>{corto ? null : <span className="faint"> de {loc.total}</span>}
    </span>
  );
}

/** Tarjeta "Colócala aquí": Bulk, posición y vecinas; o la casilla/bolsillo del álbum. */
export function Colocacion({ entrada, loc, compacta }: { entrada: Entrada; loc: Donde | null; compacta?: boolean }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  if (!loc) return null;
  const idioma = perfil.idioma_nombres;
  if (loc.tipo === 'coleccion') {
    return (
      <div className="placement" style={{ marginTop: 12 }}>
        <div className="small" style={{ fontWeight: 700, opacity: 0.8 }}>{compacta ? 'Ubicación actual' : '¡Guardada! Colócala aquí:'}</div>
        <div className="where">📒 Álbum {nombreColeccion(loc.set, idioma, true)} {loc.idioma} · casilla <b>{loc.numero}</b></div>
        <div className="small">Las casillas del álbum siguen el número impreso de la carta.</div>
      </div>
    );
  }
  if (loc.tipo === 'album') {
    return (
      <div className="placement" style={{ marginTop: 12 }}>
        <div className="small" style={{ fontWeight: 700, opacity: 0.8 }}>{compacta ? 'Ubicación actual' : '¡Guardada! Colócala aquí:'}</div>
        <div className="where">📒 Álbum «{loc.album.nombre}» · página {loc.pagina} · bolsillo {loc.bolsillo}</div>
        <div className="small">Bolsillo {loc.indice + 1} de {loc.album.paginas * loc.porPagina} ({loc.album.columnas} × {loc.album.filas} por página).</div>
      </div>
    );
  }
  const vecina = (e: Entrada | null, label: string) => (
    <div className="neighbor">
      <span className="faint">{label}</span>
      {e ? <><b>{numeroEntrada(cat, e)} {nombreEntrada(cat, e, idioma)}</b><span className="muted">{coleccionEntrada(cat, e, idioma)}</span></> : <><b>—</b><span className="muted">{label === 'Antes' ? 'inicio del Bulk' : 'final del Bulk'}</span></>}
    </div>
  );
  return (
    <div className="placement" style={{ marginTop: 12 }}>
      <div className="small" style={{ fontWeight: 700, opacity: 0.8 }}>{compacta ? 'Ubicación actual' : '¡Guardada! Colócala aquí:'}</div>
      <div className="where">📦 {loc.caja.nombre} · posición {loc.idx} de {loc.total}</div>
      <div className="small">Bulk {loc.ordinalCaja}º de izquierda a derecha · sección <b>{loc.seccion}</b>{loc.caja.modo === 'manual' ? ' · orden manual' : ''}</div>
      <div className="between">
        {vecina(loc.anterior, 'Antes')}
        <div className="me">{numeroEntrada(cat, entrada)}<br />{nombreEntrada(cat, entrada, idioma)}</div>
        {vecina(loc.siguiente, 'Después')}
      </div>
    </div>
  );
}
