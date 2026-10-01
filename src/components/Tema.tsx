'use client';
import { useEffect, useState } from 'react';
import { Icono } from './Icono';
import { usePerfil } from './PerfilProvider';

export type Tema = 'auto' | 'claro' | 'oscuro';
const CLAVE = 'tema';
// Ajustes de layout · 8: el diseño confirmado es el claro (crema): es el tema por defecto aunque el sistema esté en
// oscuro. La elección se guarda por usuario en este dispositivo ('tema:<id>') y se copia a 'tema' para que el script
// inicial del layout la aplique antes de pintar.
export const TEMA_POR_DEFECTO: Tema = 'claro';

/** Aplica el tema al <html> (lo mismo hace el script inicial del layout antes de pintar). */
export function aplicarTema(t: Tema) {
  const html = document.documentElement;
  if (t === 'claro') html.setAttribute('data-theme', 'light');
  else if (t === 'oscuro') html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
  const oscuro = t === 'oscuro' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', oscuro ? '#141A2E' : '#FFF6E5'));
}
const esTema = (t: string | null): t is Tema => t === 'claro' || t === 'oscuro' || t === 'auto';
/** Tema guardado del usuario (o del dispositivo si no hay usuario); si no hay nada guardado, claro. */
export function temaGuardado(usuarioId?: string | null): Tema {
  try {
    const propio = usuarioId ? localStorage.getItem(`${CLAVE}:${usuarioId}`) : null;
    if (esTema(propio)) return propio;
    const general = localStorage.getItem(CLAVE);
    return esTema(general) ? general : TEMA_POR_DEFECTO;
  } catch { return TEMA_POR_DEFECTO; }
}
export function guardarTema(t: Tema, usuarioId?: string | null) {
  try { if (usuarioId) localStorage.setItem(`${CLAVE}:${usuarioId}`, t); localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento */ }
  aplicarTema(t);
}

/** Al entrar a la app, aplica el tema del usuario que inició sesión (cada usuario tiene su elección). */
export function AplicarTemaUsuario() {
  const { perfil } = usePerfil();
  useEffect(() => { guardarTema(temaGuardado(perfil.id), perfil.id); }, [perfil.id]);
  return null;
}

/** Selector Claro (por defecto) / Oscuro / Automático (según el sistema); se guarda por usuario en este dispositivo. */
export function SelectorTema() {
  const { perfil } = usePerfil();
  const [tema, setTema] = useState<Tema>(TEMA_POR_DEFECTO);
  useEffect(() => { setTema(temaGuardado(perfil.id)); }, [perfil.id]);
  function elegir(t: Tema) { setTema(t); guardarTema(t, perfil.id); }
  return (
    <div className="seg" data-testid="selector-tema">
      {([['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['auto', 'Automático', 'tema_auto']] as const).map(([v, txt, ico]) => <button key={v} className={tema === v ? 'active' : ''} onClick={() => elegir(v)} data-testid={`tema-${v}`} title={v === 'auto' ? 'Según el modo del sistema' : v === 'claro' ? 'El diseño de la app (por defecto)' : undefined}><Icono n={ico} /> {txt}</button>)}
    </div>
  );
}

/** Script que corre antes de pintar: sin nada guardado, claro; 'auto' sigue al sistema. */
export const SCRIPT_TEMA = "try{var t=localStorage.getItem('tema');var h=document.documentElement;if(t==='oscuro')h.setAttribute('data-theme','dark');else if(t==='auto')h.removeAttribute('data-theme');else h.setAttribute('data-theme','light')}catch(e){document.documentElement.setAttribute('data-theme','light')}";
