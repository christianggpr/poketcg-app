'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA } from '@/lib/config';
import { cajasOrdenadas, type Entrada } from '@/lib/coleccion';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { RegistroPrecio } from '@/lib/precios-core';
import { casillaOcupada, sugerirBulk } from '@/lib/sugerir';
import { Icono } from './Icono';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';
import { usePrecios } from './PreciosProvider';
import { usePedirPrecios } from './Precio';
import { Sheet } from './Sheet';
import { Thumb } from './Thumb';
import { useToast } from './Toast';
import { useEsPC } from './ui';

// Mejoras 3 · C (maquetas M3-Hoja, M3-Agregar, PC-M3-Agregar): agregar rápido desde una casilla gris del álbum.
// La ventana llega completada (carta, casilla, idioma del álbum, estado NM); solo pregunta el acabado (Normal · Holo ·
// Reverse Holo · Otro…) y la cantidad. Guardar cierra; "Guardar y siguiente" abre la siguiente casilla vacía.
// PC: Enter = guardar y siguiente, Esc = cerrar, 1–4 = acabado. El último acabado elegido se recuerda en la sesión.

const CLAVE_ACABADO = 'poketcg:acabado-rapido';
/** Los cuatro botones grandes y su acabado registrado (Otro… abre la lista completa). */
const BOTONES_ACABADO: { tecla: string; nombre: string; valor: string | null }[] = [
  { tecla: '1', nombre: 'Normal', valor: 'Normal' },
  { tecla: '2', nombre: 'Holo', valor: 'Holo' },
  { tecla: '3', nombre: 'Reverse Holo', valor: 'Reverse' },
  { tecla: '4', nombre: 'Otro…', valor: null }
];
const NOMBRE_IDIOMA: Record<string, string> = { ES: 'Español', EN: 'Inglés', JP: 'Japonés', PT: 'Portugués', FR: 'Francés', DE: 'Alemán', IT: 'Italiano', Otro: 'Otro idioma' };

/** Último acabado elegido en esta sesión de carga (se recuerda mientras dure la pestaña). */
export function ultimoAcabadoRapido(): string | null { try { return sessionStorage.getItem(CLAVE_ACABADO); } catch { return null; } }
function recordarAcabado(a: string) { try { sessionStorage.setItem(CLAVE_ACABADO, a); } catch { /* sin almacenamiento */ } }

/**
 * Acabado más común de una carta según los precios (qué acabados existen en TCGplayer) o, sin precios, su rareza:
 * Normal si existe; si no, Holo o Reverse. Funciona también sin registro (null).
 */
export function acabadoMasComun(carta: Carta, rec: RegistroPrecio | null | undefined): string {
  const tp = rec?.ok ? rec.tp : null;
  if (tp) {
    if (tp.normal != null || tp.unlimited != null || tp['1st-edition'] != null) return 'Normal';
    if (tp.holofoil != null || tp['unlimited-holofoil'] != null || tp['1st-edition-holofoil'] != null) return 'Holo';
    if (tp['reverse-holofoil'] != null) return 'Reverse';
  }
  const r = (carta.r || '').toLowerCase();
  if (/holo|ultra|illustration|secret|hyper|special|double|shiny|ace|rainbow|gold|promo/.test(r) && !/reverse/.test(r)) return 'Holo';
  return 'Normal';
}

type Props = {
  carta: Carta;
  set: Coleccion;
  /** Idioma del álbum ('' si el álbum no tiene idioma). */
  idiomaAlbum: string;
  /** Siguiente casilla vacía del álbum (para "Guardar y siguiente"), si la hay. */
  siguiente: Carta | null;
  onClose: () => void;
  /** Tras guardar: la casilla pasa a color; `continuar` = abrir la siguiente casilla vacía. */
  onGuardada: (carta: Carta, continuar: boolean) => void;
};

export function AgregarRapidoSheet({ carta, set, idiomaAlbum, siguiente, onClose, onGuardada }: Props) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const toast = useToast();
  const esPC = useEsPC();
  usePedirPrecios([carta.id]);
  const cajas = cajasOrdenadas(col.cajas);
  const [idioma, setIdioma] = useState(idiomaAlbum && idiomaAlbum !== '—' ? idiomaAlbum : set.rg === 'ja' ? 'JP' : '');
  const [condicion, setCondicion] = useState('NM');
  const [cantidad, setCantidad] = useState(1);
  const [cambiar, setCambiar] = useState(false);
  const [otro, setOtro] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [acabado, setAcabado] = useState<string>(() => ultimoAcabadoRapido() ?? acabadoMasComun(carta, precios.registro(carta.id)));
  const elegidoAMano = useRef(!!ultimoAcabadoRapido());
  // si los precios llegan después de abrir y el usuario no ha tocado nada, se ajusta la preselección
  useEffect(() => { if (!elegidoAMano.current) setAcabado(acabadoMasComun(carta, precios.registro(carta.id))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [precios.version, carta.id]);
  const idiomaCarta = idioma || (set.rg === 'ja' ? 'JP' : 'EN');
  const ctx = useMemo(() => ({ cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId }), [cat, col.entradas, col.cajas, col.albumes, col.casillas, perfil.idioma_nombres, col.ultimaCajaId]);
  // Mejoras 3 · C7: si la casilla ya se llenó mientras tanto (otro dispositivo), se avisa y la copia va al Bulk.
  // Además del estado local (tiempo real), al abrir se consulta la base por si el otro dispositivo acaba de guardar.
  const [servidor, setServidor] = useState<Entrada[]>([]);
  useEffect(() => {
    let vivo = true;
    supabaseBrowser().from('entradas').select('*').eq('carta_id', carta.id).then(r => { if (vivo && !r.error && r.data) setServidor(r.data as Entrada[]); });
    return () => { vivo = false; };
  }, [carta.id]);
  const todas = useMemo(() => [...col.entradas, ...servidor.filter(s => !col.entradas.some(e => e.id === s.id))], [col.entradas, servidor]);
  const ocupada = casillaOcupada(cat, todas, carta, idiomaCarta);
  const bulk = sugerirBulk(ctx, carta, idioma);
  const cajaRep = bulk?.caja.id || (col.ultimaCajaId && cajas.some(c => c.id === col.ultimaCajaId) ? col.ultimaCajaId : cajas[0]?.id || null);
  const nombreBulk = cajas.find(c => c.id === cajaRep)?.nombre || null;
  const elegir = (a: string) => { setAcabado(a); elegidoAMano.current = true; recordarAcabado(a); };
  const esBoton = BOTONES_ACABADO.some(b => b.valor === acabado);

  async function guardar(continuar: boolean) {
    if (guardando) return;
    setGuardando(true);
    const base = { carta_id: carta.id, personalizada: null, acabado, idioma, condicion, nota: '' };
    let ok = false;
    if (ocupada.length) {
      // la casilla ya tiene una copia: todo va al Bulk como repetidas (si no hay Bulk, queda por colocar)
      const r = await col.agregarEntrada({ ...base, caja_id: cajaRep, cantidad });
      ok = !!r;
    } else {
      const r = await col.agregarEntrada({ ...base, caja_id: null, cantidad: 1, sinFusionar: true });
      if (r) { await col.colocarEnColeccion(r.entrada.id, set.id); ok = true; }
      if (r && cantidad > 1) await col.agregarEntrada({ ...base, caja_id: cajaRep, cantidad: cantidad - 1 });
    }
    setGuardando(false);
    if (!ok) { toast('No se pudo guardar', 'danger'); return; }
    recordarAcabado(acabado);
    toast(ocupada.length ? `${nombreCarta(carta, perfil.idioma_nombres)} guardada en ${nombreBulk || 'por colocar'}` : `${carta.l} · ${nombreCarta(carta, perfil.idioma_nombres)} guardada en el álbum${cantidad > 1 ? ` (+${cantidad - 1} a ${nombreBulk || 'por colocar'})` : ''}`, 'ok', 2200);
    onGuardada(carta, continuar && !!siguiente);
  }

  // PC: Enter = guardar y siguiente (o guardar si es la última), 1–4 = acabado (Esc lo maneja la hoja)
  useEffect(() => {
    if (!esPC) return;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if (e.key === 'Enter' && !(enCampo && t.tagName !== 'INPUT')) { e.preventDefault(); guardar(true); return; }
      if (enCampo) return;
      const b = BOTONES_ACABADO.find(x => x.tecla === e.key);
      if (b) { e.preventDefault(); if (b.valor) { elegir(b.valor); setOtro(false); } else setOtro(true); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [esPC, acabado, idioma, condicion, cantidad, ocupada.length, cajaRep, guardando, siguiente]);

  const etiquetaIdioma = idioma ? `${NOMBRE_IDIOMA[idioma] || idioma} · del álbum` : 'Sin idioma';
  return (
    <Sheet onClose={onClose} className="hoja-rapida" pie={
      <div className="botones-rapido">
        <button type="button" className="btn" onClick={() => guardar(false)} disabled={guardando} data-testid="rapido-guardar">{guardando ? 'Guardando…' : 'Guardar'}</button>
        {siguiente ? <button type="button" className="btn primary" onClick={() => guardar(true)} disabled={guardando} data-testid="rapido-siguiente">Guardar y siguiente ({siguiente.l})</button> : null}
      </div>
    }>
      <div className="rapido-cabecera" data-testid="rapido-cabecera">
        <div className="rapido-thumb"><Thumb carta={carta} set={set} idioma={idioma} className="lg" grande /></div>
        <div className="rapido-datos">
          <div className="small muted">Casilla {carta.l} · {nombreColeccion(set, perfil.idioma_nombres, true)}</div>
          <h3 className="rapido-nombre" data-testid="rapido-nombre">{nombreCarta(carta, perfil.idioma_nombres)}</h3>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="pill info" data-testid="rapido-idioma">{etiquetaIdioma}</span>
            <span className="pill ok" data-testid="rapido-estado" title={ETIQUETA_CONDICION[condicion] || undefined}>{condicion || 'Sin estado'}</span>
            <span className="small muted">{numLabel(carta, set)}</span>
          </div>
        </div>
        <button className="cerrar rapido-cerrar" onClick={onClose} aria-label="Cerrar" type="button"><Icono n="cerrar" tam={20} /></button>
        <div className="rapido-acabado">
          {ocupada.length ? <div className="notice warn small" data-testid="rapido-ocupada"><Icono n="alerta" tam={14} /> Esta casilla ya tiene {ocupada.reduce((n, e) => n + e.cantidad, 0) === 1 ? 'una copia' : 'copias'} (quizá la agregaste desde otro dispositivo). Esta copia irá a <b>{nombreBulk || 'por colocar'}</b> como repetida.</div> : null}
          <div className="pregunta-rapido">¿Qué acabado tiene?</div>
          <div className="acabados-rapido" role="radiogroup" aria-label="Acabado" data-testid="acabados-rapido">
            {BOTONES_ACABADO.map(b => {
              const activo = b.valor ? acabado === b.valor && !otro : otro || !esBoton;
              return <button key={b.tecla} type="button" role="radio" aria-checked={activo} className={`btn acabado-rapido ${activo ? 'active' : ''}`} onClick={() => { if (b.valor) { elegir(b.valor); setOtro(false); } else setOtro(true); }} title={esPC ? `Tecla ${b.tecla}` : undefined} data-testid={`acabado-${b.valor ? b.valor.toLowerCase() : 'otro'}`}>{b.nombre}{esPC ? <span className="tecla">{b.tecla}</span> : null}</button>;
            })}
          </div>
          {otro || !esBoton ? <select className="input" value={acabado} onChange={e => elegir(e.target.value)} aria-label="Acabado (lista completa)" data-testid="acabado-lista" style={{ marginTop: 8 }}>{ACABADOS.map(a => <option key={a} value={a}>{a || 'Sin acabado'}</option>)}</select> : null}
        </div>
      </div>
      <div className="row cantidad-rapido" style={{ marginTop: 12, justifyContent: 'space-between', alignItems: 'center' }}>
        <b>Cantidad</b>
        <div className="stepper" data-testid="rapido-cantidad"><button type="button" onClick={() => setCantidad(c => Math.max(1, c - 1))} aria-label="Menos">−</button><input type="number" min={1} value={cantidad} onChange={e => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))} /><button type="button" onClick={() => setCantidad(c => c + 1)} aria-label="Más">+</button></div>
      </div>
      {cantidad > 1 && !ocupada.length ? <div className="small muted" data-testid="rapido-aviso-bulk">Más de 1: una va al álbum y el resto a <b>{nombreBulk || 'por colocar (crea un Bulk)'}</b>.</div> : null}
      {esPC ? <div className="small muted" style={{ marginTop: 8 }}>Enter: guardar y siguiente · Esc: cerrar · 1–4: acabado</div> : null}
      {!cambiar ? <button type="button" className="link cambiar-rapido" onClick={() => setCambiar(true)} data-testid="rapido-cambiar">Cambiar idioma o estado</button> : (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <div className="field"><label>Idioma</label><select className="input" value={idioma} onChange={e => setIdioma(e.target.value)} data-testid="rapido-select-idioma"><option value="">—</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          <div className="field"><label>Estado</label><select className="input" value={condicion} onChange={e => setCondicion(e.target.value)} data-testid="rapido-select-estado">{CONDICIONES.map(c => <option key={c} value={c}>{c ? ETIQUETA_CONDICION[c] || c : '—'}</option>)}</select></div>
        </div>
      )}
    </Sheet>
  );
}
