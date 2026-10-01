'use client';
import { useEffect } from 'react';
import { Icono } from './Icono';

/** Hoja inferior (celular) / ventana centrada (PC). Se cierra con el fondo, la X o Escape. */
export function Sheet({ titulo, sobre, onClose, children, pie, className = '' }: { titulo?: string; sobre?: React.ReactNode; onClose: () => void; children: React.ReactNode; pie?: React.ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="grabber" />
        {titulo || sobre ? (
          <div className="sheet-head">
            <div className="grow">{sobre ? <div className="small sheet-sobre">{sobre}</div> : null}{titulo ? <h3>{titulo}</h3> : null}</div>
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
