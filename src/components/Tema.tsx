'use client';
import { useEffect, useState } from 'react';

export type Tema = 'auto' | 'claro' | 'oscuro';
const CLAVE = 'tema';

/** Aplica el tema guardado al <html> (lo mismo hace el script inicial del layout antes de pintar). */
export function aplicarTema(t: Tema) {
  const html = document.documentElement;
  if (t === 'claro') html.setAttribute('data-theme', 'light');
  else if (t === 'oscuro') html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
  const oscuro = t === 'oscuro' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', oscuro ? '#0f1526' : '#f3f5fa'));
}
export function temaGuardado(): Tema {
  try { const t = localStorage.getItem(CLAVE); return t === 'claro' || t === 'oscuro' ? t : 'auto'; } catch { return 'auto'; }
}

/** Selector Automático / Claro / Oscuro (se guarda en este dispositivo). */
export function SelectorTema() {
  const [tema, setTema] = useState<Tema>('auto');
  useEffect(() => { setTema(temaGuardado()); }, []);
  function elegir(t: Tema) {
    setTema(t);
    try { if (t === 'auto') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento */ }
    aplicarTema(t);
  }
  return (
    <div className="seg" data-testid="selector-tema">
      {([['auto', '🌗 Automático'], ['claro', '☀️ Claro'], ['oscuro', '🌙 Oscuro']] as const).map(([v, txt]) => <button key={v} className={tema === v ? 'active' : ''} onClick={() => elegir(v)} data-testid={`tema-${v}`}>{txt}</button>)}
    </div>
  );
}

/** Script que corre antes de pintar para evitar el parpadeo al cargar con tema guardado. */
export const SCRIPT_TEMA = "try{var t=localStorage.getItem('tema');if(t==='claro')document.documentElement.setAttribute('data-theme','light');else if(t==='oscuro')document.documentElement.setAttribute('data-theme','dark')}catch(e){}";
