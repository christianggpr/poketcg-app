'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icono } from './Icono';

// Mejoras 4 · F: las instrucciones largas no van sueltas en la pantalla (se parten feo al achicar la ventana):
// van detrás de un icono ⓘ Ayuda que las muestra al tocarlo, o se muestran solo la primera vez (AvisoPrimeraVez).

/** Icono ⓘ (44 px) que abre un globo con la explicación; se cierra tocando fuera, con Escape o con el mismo icono. */
export function Ayuda({ texto, titulo = 'Ayuda', className = '', testid = 'btn-ayuda' }: { texto: ReactNode; titulo?: string; className?: string; testid?: string }) {
  const [abierta, setAbierta] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierta(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierta]);
  return (
    <span className={`ayuda ${className}`} ref={ref}>
      <button type="button" className={`btn icon sm ghost btn-ayuda ${abierta ? 'active' : ''}`} onClick={() => setAbierta(a => !a)} aria-label={titulo} title={titulo} aria-expanded={abierta} data-testid={testid}><Icono n="info" tam={20} /></button>
      {abierta ? <span className="ayuda-globo" role="tooltip" data-testid="ayuda-globo">{texto}</span> : null}
    </span>
  );
}

const CLAVE = 'poketcg:aviso-visto:';
/** Aviso que se muestra solo la primera vez (hasta que se cierra con "Entendido"); se recuerda en este dispositivo. */
export function AvisoPrimeraVez({ clave, children, className = '' }: { clave: string; children: ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { try { setVisible(localStorage.getItem(CLAVE + clave) !== '1'); } catch { setVisible(true); } }, [clave]);
  if (!visible) return null;
  const cerrar = () => { try { localStorage.setItem(CLAVE + clave, '1'); } catch { /* sin almacenamiento */ } setVisible(false); };
  return (
    <div className={`notice info small aviso-primera-vez ${className}`} data-testid={`aviso-${clave}`}>
      <span className="grow">{children}</span>
      <button type="button" className="btn sm" onClick={cerrar} data-testid={`entendido-${clave}`}>Entendido</button>
    </div>
  );
}
