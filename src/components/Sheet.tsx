'use client';
import { useEffect, useRef } from 'react';
import { Icono } from './Icono';

// Mejoras 1 · A1 (arreglo): el bloqueo del desplazamiento se lleva con una pila de hojas abiertas. Antes cada hoja
// guardaba el valor anterior de body.overflow y lo restauraba al cerrarse; con dos hojas apiladas (p. ej. editar una
// carta → "Eliminar" → confirmar) que se cerraban a la vez, la de arriba restauraba "hidden" al final y la página
// quedaba sin poder bajar hasta recargar. Ahora solo la última hoja en cerrarse libera el desplazamiento, y Escape
// cierra únicamente la hoja de arriba.
const pila: symbol[] = [];
function abrirHoja(id: symbol) { pila.push(id); document.body.style.overflow = 'hidden'; }
function cerrarHoja(id: symbol) { const i = pila.indexOf(id); if (i >= 0) pila.splice(i, 1); if (!pila.length) document.body.style.overflow = ''; }
/** Si no queda ninguna hoja montada (p. ej. tras cambiar de página), libera el desplazamiento. */
export function liberarScrollSiNoHayHojas() {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('.sheet-backdrop')) { pila.length = 0; document.body.style.overflow = ''; }
}

/** Hoja inferior (celular) / ventana centrada (PC). Se cierra con el fondo, la X o Escape. */
export function Sheet({ titulo, sobre, cabecera, onClose, children, pie, className = '' }: { titulo?: string; sobre?: React.ReactNode; /** algo a la derecha del título (p. ej. "Limpiar") */ cabecera?: React.ReactNode; onClose: () => void; children: React.ReactNode; pie?: React.ReactNode; className?: string }) {
  const id = useRef<symbol | null>(null);
  if (!id.current) id.current = Symbol('hoja');
  useEffect(() => { const h = id.current!; abrirHoja(h); return () => cerrarHoja(h); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && pila[pila.length - 1] === id.current) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="grabber" />
        {titulo || sobre ? (
          <div className="sheet-head">
            <div className="grow">{sobre ? <div className="small sheet-sobre">{sobre}</div> : null}{titulo ? <h3>{titulo}</h3> : null}</div>
            {cabecera ? <div className="sheet-cabecera-extra">{cabecera}</div> : null}
            <button className="cerrar" onClick={onClose} aria-label="Cerrar" type="button"><Icono n="cerrar" tam={20} /></button>
          </div>
        ) : null}
        {children}
        {pie ? <div className="sheet-foot">{pie}</div> : null}
      </div>
    </div>
  );
}
/** Nombres del layout v2: la misma hoja es "HojaInferior" en celular y "Ventana" en PC (≥ 860 px). */
export const HojaInferior = Sheet;
export const Ventana = Sheet;

export function Confirmar({ titulo, texto, okLabel = 'Aceptar', peligro, onOk, onClose }: { titulo: string; texto: string; okLabel?: string; peligro?: boolean; onOk: () => void; onClose: () => void }) {
  return (
    <Sheet titulo={titulo} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className={`btn ${peligro ? 'danger' : 'primary'}`} onClick={onOk}>{okLabel}</button></>}>
      <p className="muted">{texto}</p>
    </Sheet>
  );
}
