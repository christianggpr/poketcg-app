'use client';
import { useEffect, useRef, useState } from 'react';
import { FONDOS, FONDO_POR_DEFECTO, INTENSIDAD_POR_DEFECTO, esFondo, opacidadDeIntensidad, patronDeFondo, type IdFondo } from '@/lib/patrones';
import { supabaseBrowser } from '@/lib/supabase/client';
import { usePerfil } from './PerfilProvider';
import { PatronMosaico } from './Portadas';
import { useToast } from './Toast';
import { useEsPC } from './ui';

// Mejoras 3 · B (maqueta M3-Fondo): fondo de la app. Un solo SVG fijo detrás de todas las pantallas con un patrón
// original en trazo (llamas, olas, hojas, rayos, estrellas) en mosaico inclinado 12°, como marca de agua suave.
// Se guarda en el perfil (fondo + fondo_intensidad) para que se mantenga en el celular y la PC; si la base aún no tiene
// esas columnas (0008 sin pegar), se recuerda en este dispositivo.

const CLAVE_LOCAL = 'poketcg:fondo';

type Eleccion = { fondo: IdFondo; intensidad: number };

function leerLocal(uid: string): Eleccion | null {
  try { const t = localStorage.getItem(`${CLAVE_LOCAL}:${uid}`); if (!t) return null; const o = JSON.parse(t); return esFondo(o.fondo) ? { fondo: o.fondo, intensidad: Number(o.intensidad) } : null; } catch { return null; }
}
function guardarLocal(uid: string, e: Eleccion) { try { localStorage.setItem(`${CLAVE_LOCAL}:${uid}`, JSON.stringify(e)); } catch { /* sin almacenamiento */ } }

/** Fondo e intensidad del usuario: del perfil si la base los tiene; si no, lo recordado en el dispositivo; si no, Hojas al 40 %. */
export function eleccionDe(perfil: { id: string; fondo?: string | null; fondo_intensidad?: number | null }): Eleccion {
  if (esFondo(perfil.fondo)) return { fondo: perfil.fondo, intensidad: Number.isFinite(Number(perfil.fondo_intensidad)) && perfil.fondo_intensidad != null ? Number(perfil.fondo_intensidad) : INTENSIDAD_POR_DEFECTO };
  return (typeof window !== 'undefined' && leerLocal(perfil.id)) || { fondo: FONDO_POR_DEFECTO, intensidad: INTENSIDAD_POR_DEFECTO };
}

/** La marca de agua fija detrás de la app (va una sola vez, en AppShell). */
export function FondoApp() {
  const { perfil } = usePerfil();
  const esPC = useEsPC();
  const [eleccion, setEleccion] = useState<Eleccion>(() => ({ fondo: esFondo(perfil.fondo) ? perfil.fondo : FONDO_POR_DEFECTO, intensidad: perfil.fondo_intensidad ?? INTENSIDAD_POR_DEFECTO }));
  useEffect(() => { setEleccion(eleccionDe(perfil)); }, [perfil]);
  const patron = patronDeFondo(eleccion.fondo);
  const opacidad = opacidadDeIntensidad(eleccion.intensidad);
  if (!patron || opacidad <= 0) return <div className="fondo-app liso" data-testid="fondo-app" data-fondo={eleccion.fondo} aria-hidden="true" />;
  return (
    <div className={`fondo-app ${patron}`} data-testid="fondo-app" data-fondo={eleccion.fondo} data-patron={patron} data-intensidad={eleccion.intensidad} aria-hidden="true">
      <PatronMosaico patron={patron} escala={esPC ? 1.125 : 1} opacidad={opacidad} />
    </div>
  );
}

/** Ajustes → Apariencia → Fondo de la app: opciones con vista previa, Aleatorio (cambia cada día) e intensidad. */
export function SelectorFondo() {
  const { perfil, setPerfil } = usePerfil();
  const toast = useToast();
  const [eleccion, setEleccion] = useState<Eleccion>(() => eleccionDe(perfil));
  const [guardando, setGuardando] = useState(false);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setEleccion(eleccionDe(perfil)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [perfil.id]);
  const hoy = patronDeFondo('aleatorio');
  /** Guarda en el perfil; las escrituras van en fila (una tras otra) para que la última elección sea la que queda. */
  function guardar(nueva: Eleccion) {
    setEleccion(nueva);
    guardarLocal(perfil.id, nueva);
    setPerfil({ ...perfil, fondo: nueva.fondo, fondo_intensidad: nueva.intensidad });   // se aplica al instante
    setGuardando(true);
    cola.current = cola.current.then(async () => {
      const { error } = await supabaseBrowser().from('perfiles').update({ fondo: nueva.fondo, fondo_intensidad: nueva.intensidad }).eq('id', perfil.id);
      if (error && !(error.code === 'PGRST204' || error.code === '42703' || /column|columna/i.test(error.message || ''))) toast('No se pudo guardar el fondo: ' + error.message, 'danger');
    }).catch(() => {}).then(() => setGuardando(false));
  }
  /** La intensidad se guarda poco después de soltar el control (sin una escritura por cada paso). */
  function cambiarIntensidad(valor: number) {
    setEleccion(x => ({ ...x, intensidad: valor }));
    setPerfil({ ...perfil, fondo: eleccion.fondo, fondo_intensidad: valor });
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => guardar({ fondo: eleccion.fondo, intensidad: valor }), 350);
  }
  return (
    <div data-testid="selector-fondo">
      <div className="fondos" role="radiogroup" aria-label="Fondo de la app">
        {FONDOS.map(f => {
          const patron = f.id === 'aleatorio' ? null : patronDeFondo(f.id);
          const activo = eleccion.fondo === f.id;
          return (
            <button key={f.id} type="button" role="radio" aria-checked={activo} className={`fondo-opcion ${activo ? 'active' : ''}`} onClick={() => guardar({ ...eleccion, fondo: f.id })} data-testid={`fondo-${f.id}`}>
              <span className={`vista ${patron ? patron : ''}`} aria-hidden="true">
                {patron ? <PatronMosaico patron={patron} escala={0.625} opacidad={0.22} /> : f.id === 'aleatorio' ? <span className="nota">cambia cada día<br /><span className="small">hoy: {FONDOS.find(x => x.id === hoy)?.nombre}</span></span> : null}
              </span>
              <span className="rotulo-fondo">{f.nombre}{activo ? <span className="elegido">Elegido</span> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="intensidad-fondo">Intensidad · {eleccion.intensidad} %</label>
        <input id="intensidad-fondo" type="range" min={0} max={100} step={5} value={eleccion.intensidad} onChange={e => cambiarIntensidad(Number(e.target.value))} aria-label="Intensidad de la marca de agua" data-testid="intensidad-fondo" className="rango" />
        <div className="small muted">0 % lo apaga; 40 % es el punto suave recomendado.{guardando ? ' Guardando…' : ''}</div>
      </div>
    </div>
  );
}
