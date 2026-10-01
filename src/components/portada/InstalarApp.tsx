'use client';
import { Icono } from '../Icono';
import { useEffect, useState } from 'react';
import type { AppAndroid } from '@/lib/descargas';

type PromptInstalacion = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/**
 * Sección "Lleva PokéTCG en tu celular": descarga del APK (cuando ya está publicado), instalación desde el
 * navegador (Chrome/Edge en Android y PC) e instrucciones para iPhone.
 */
export function InstalarApp({ apk, compacto }: { apk: AppAndroid | null; compacto?: boolean }) {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [so, setSo] = useState<'android' | 'ios' | 'otro'>('otro');
  const [verPasos, setVerPasos] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setSo(/android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'otro');
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) setInstalada(true);
    const alPoder = (e: Event) => { e.preventDefault(); setPrompt(e as PromptInstalacion); };
    const alInstalar = () => { setInstalada(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', alPoder);
    window.addEventListener('appinstalled', alInstalar);
    return () => { window.removeEventListener('beforeinstallprompt', alPoder); window.removeEventListener('appinstalled', alInstalar); };
  }, []);

  async function instalar() {
    if (!prompt) return;
    await prompt.prompt();
    const r = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (r.outcome === 'accepted') setInstalada(true);
    setPrompt(null);
  }

  if (instalada) return <div className="descarga-app" data-testid="instalar-app"><div className="ico"><Icono n="ok_circulo" tam={28} /></div><div><b>Ya tienes PokéTCG instalada como app.</b><span className="small muted"> Ábrela desde tu pantalla de inicio.</span></div></div>;

  return (
    <div className="descarga-app" data-testid="instalar-app">
      <div className="ico"><Icono n="celular" tam={28} /></div>
      <div className="grow">
        <b>Lleva {compacto ? 'la app' : 'PokéTCG'} en tu celular</b>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>Icono en tu pantalla, pantalla completa y tu colección siempre a la mano. Es la misma app: se actualiza sola.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          {apk ? <a className="btn primary btn-apk" href={apk.url} download="poketcg.apk" data-testid="btn-apk"><span><Icono n="robot" /> Descargar app para Android</span><span className="small" style={{ opacity: 0.85, fontWeight: 500 }}>.apk · {apk.tamano} · versión {apk.version}</span></a> : <span className="btn" aria-disabled="true" style={{ opacity: 0.6 }}><Icono n="robot" /> App para Android: muy pronto</span>}
          {prompt ? <button className="btn" onClick={instalar} data-testid="btn-instalar-pwa"><Icono n="descargar" /> Instalar desde el navegador</button> : null}
          {so === 'ios' ? <span className="small muted">En iPhone: toca <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.</span> : null}
        </div>
        {apk ? (
          <div className="small" style={{ marginTop: 8 }}>
            <button className="link" onClick={() => setVerPasos(v => !v)}>{verPasos ? 'Ocultar pasos' : '¿Cómo se instala el .apk?'}</button>
            {verPasos ? (
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Descarga el archivo y ábrelo desde la barra de notificaciones o desde «Descargas».</li>
                <li>Si tu celular pregunta, permite <b>instalar apps de este origen</b> (solo esta vez).</li>
                <li>Pulsa <b>Instalar</b>. PokéTCG aparecerá junto a tus demás apps.</li>
                <li>Para actualizar la app nunca hace falta volver a descargar: los cambios llegan solos.</li>
              </ol>
            ) : null}
            <div className="muted" style={{ marginTop: 4 }}>Requiere Android 5 o superior con Google Chrome instalado. Publicada el {new Date(apk.fecha + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}.</div>
          </div>
        ) : so === 'android' && !prompt ? <div className="small muted" style={{ marginTop: 8 }}>Mientras tanto, en Chrome: menú ⋮ → <b>Instalar aplicación</b> (o «Añadir a pantalla de inicio»).</div> : null}
      </div>
    </div>
  );
}
