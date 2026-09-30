'use client';
import { useEffect } from 'react';

/** Hoja inferior (modal). Se cierra con el fondo, la X o Escape. */
export function Sheet({ titulo, onClose, children, pie }: { titulo?: string; onClose: () => void; children: React.ReactNode; pie?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        {titulo ? <div className="sheet-head"><h3>{titulo}</h3><button className="btn sm ghost" onClick={onClose} aria-label="Cerrar">✕</button></div> : null}
        {children}
        {pie ? <div className="sheet-foot">{pie}</div> : null}
      </div>
    </div>
  );
}

export function Confirmar({ titulo, texto, okLabel = 'Aceptar', peligro, onOk, onClose }: { titulo: string; texto: string; okLabel?: string; peligro?: boolean; onOk: () => void; onClose: () => void }) {
  return (
    <Sheet titulo={titulo} onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className={`btn ${peligro ? 'danger' : 'primary'}`} onClick={onOk}>{okLabel}</button></>}>
      <p className="muted">{texto}</p>
    </Sheet>
  );
}
