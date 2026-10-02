'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TYPE_ES, TYPE_ORDER, fold, nombreColeccion, rarezaLabel, type Coleccion } from '@/lib/catalogo';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA } from '@/lib/config';
import { FILTROS_VACIOS, PRECIO_TOPE, chipsDe, cuentaFiltros, filtrosDeParams, opcionesCatalogo, paramsDeFiltros, quitarFiltro, type ClaveFiltro, type Filtros } from '@/lib/filtros';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';
import { Icono, PuntoEnergia } from './Icono';
import { Sheet } from './Sheet';
import { useEsPC } from './ui';

// Mejoras 4 · D y E: filtros compartidos del Mercado, de Buscar en mi colección y del Bulk.
// PC: panel al costado izquierdo (se puede plegar); celular: botón "Filtros · N" que abre una hoja con los mismos filtros.
// Los filtros activos se ven como chips quitables arriba de los resultados y viven en la dirección (?coleccion=…&tipo=…).

export type AmbitoFiltros = 'mercado' | 'coleccion' | 'bulk';

/** Filtros leídos de la dirección y una función que los escribe (conservando q y orden). */
export function useFiltrosUrl(): { f: Filtros; setF: (nf: Filtros) => void; params: URLSearchParams } {
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  // el cambio se aplica al instante (copia local) y la dirección se actualiza detrás; al cambiar la dirección manda ella
  const [local, setLocal] = useState<Filtros | null>(null);
  const deParams = useMemo(() => filtrosDeParams(params), [params]);
  useEffect(() => { setLocal(null); }, [params]);
  const f = local ?? deParams;
  const setF = (nf: Filtros) => {
    setLocal(nf);
    const p = paramsDeFiltros(nf, { q: params.get('q'), orden: params.get('orden'), faltan: params.get('faltan') });
    router.replace(`${ruta}${p.toString() ? '?' + p.toString() : ''}`, { scroll: false });
  };
  return { f, setF, params: params as unknown as URLSearchParams };
}

const CLAVE_PLEGADO = 'poketcg:filtros-plegados';
const leerPlegado = (): boolean => { try { return localStorage.getItem(CLAVE_PLEGADO) === '1'; } catch { return false; } };

/**
 * Zona de filtros: en PC, un panel plegable a la izquierda del contenido; en el celular, el botón "Filtros · N" (en `barra`)
 * abre una hoja. `children` es el contenido (resultados) y `barra` lo que va arriba de los resultados (buscador, orden…).
 */
export function ConFiltros({ ambito, f, onChange, barra, children, extraFormulario }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; barra?: ReactNode; children: ReactNode; extraFormulario?: ReactNode }) {
  const esPC = useEsPC();
  const [plegado, setPlegado] = useState(false);
  const [hoja, setHoja] = useState(false);
  useEffect(() => { setPlegado(leerPlegado()); }, []);
  const n = cuentaFiltros(f);
  const alternar = () => { setPlegado(p => { try { localStorage.setItem(CLAVE_PLEGADO, p ? '0' : '1'); } catch { /* sin almacenamiento */ } return !p; }); };
  const botonFiltros = (
    <button type="button" className={`btn sm btn-filtros ${n ? 'primary' : ''}`} onClick={() => (esPC ? alternar() : setHoja(true))} aria-expanded={esPC ? !plegado : hoja} data-testid="btn-filtros">
      <Icono n="filtros" tam={18} /> Filtros{n ? ` · ${n}` : ''}
    </button>
  );
  return (
    <div className={`con-filtros ${esPC && !plegado ? 'con-panel' : ''}`} data-testid="con-filtros">
      {esPC && !plegado ? (
        <aside className="panel-filtros" data-testid="panel-filtros" aria-label="Filtros">
          <div className="panel-filtros-cabecera">
            <b><Icono n="filtros" tam={18} /> Filtros{n ? <span className="pill info" style={{ marginLeft: 6 }}>{n}</span> : null}</b>
            <button type="button" className="btn icon sm ghost" onClick={alternar} aria-label="Plegar los filtros" title="Plegar" data-testid="btn-plegar-filtros"><Icono n="izquierda" tam={18} /></button>
          </div>
          <FormularioFiltros ambito={ambito} f={f} onChange={onChange} extra={extraFormulario} />
        </aside>
      ) : null}
      <div className="contenido-filtrado">
        <div className="barra-filtros">{(!esPC || plegado) ? botonFiltros : null}{barra}</div>
        <ChipsFiltros f={f} onChange={onChange} />
        {children}
      </div>
      {hoja && !esPC ? (
        <Sheet titulo={`Filtros${n ? ` · ${n}` : ''}`} onClose={() => setHoja(false)} className="hoja-filtros" pie={<div className="row" style={{ gap: 8 }}>{n ? <button type="button" className="btn" onClick={() => onChange({ ...FILTROS_VACIOS })} data-testid="btn-limpiar-filtros-hoja">Limpiar todo</button> : null}<button type="button" className="btn primary grow" onClick={() => setHoja(false)} data-testid="btn-ver-resultados">Ver resultados</button></div>}>
          <FormularioFiltros ambito={ambito} f={f} onChange={onChange} extra={extraFormulario} />
        </Sheet>
      ) : null}
    </div>
  );
}

/** Botón "Filtros · N" que abre la hoja con el formulario (Bulk: en PC y celular por igual, junto a la fila de chips). */
export function FiltrosEnHoja({ ambito, f, onChange, extraFormulario }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; extraFormulario?: ReactNode }) {
  const [hoja, setHoja] = useState(false);
  const n = cuentaFiltros(f);
  return (
    <>
      <button type="button" className={`btn sm btn-filtros ${n ? 'primary' : ''}`} onClick={() => setHoja(true)} aria-expanded={hoja} data-testid="btn-filtros"><Icono n="filtros" tam={18} /> Filtros{n ? ` · ${n}` : ''}</button>
      {hoja ? (
        <Sheet titulo={`Filtros${n ? ` · ${n}` : ''}`} onClose={() => setHoja(false)} className="hoja-filtros" pie={<div className="row" style={{ gap: 8 }}>{n ? <button type="button" className="btn" onClick={() => onChange({ ...FILTROS_VACIOS })} data-testid="btn-limpiar-filtros-hoja">Limpiar todo</button> : null}<button type="button" className="btn primary grow" onClick={() => setHoja(false)} data-testid="btn-ver-resultados">Ver resultados</button></div>}>
          <FormularioFiltros ambito={ambito} f={f} onChange={onChange} extra={extraFormulario} />
        </Sheet>
      ) : null}
    </>
  );
}

/** Chips de los filtros activos (cada uno se quita con su ×) y "Limpiar todo". */
export function ChipsFiltros({ f, onChange }: { f: Filtros; onChange: (f: Filtros) => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const chips = chipsDe(f, cat, perfil.idioma_nombres);
  if (!chips.length) return null;
  return (
    <div className="chips-filtros" data-testid="chips-filtros">
      {chips.map(c => <button key={c.clave} type="button" className="chip-filtro" onClick={() => onChange(quitarFiltro(f, c.clave))} aria-label={`Quitar el filtro ${c.texto}`} data-testid={`chip-${c.clave}`}>{c.texto} <Icono n="cerrar" tam={14} /></button>)}
      <button type="button" className="link" onClick={() => onChange({ ...FILTROS_VACIOS })} data-testid="btn-limpiar-filtros">Limpiar todo</button>
    </div>
  );
}

/** El formulario de filtros (mismo en el panel de PC y en la hoja del celular). */
export function FormularioFiltros({ ambito, f, onChange, extra }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; extra?: ReactNode }) {
  const cat = useCatalogo();
  const opciones = useMemo(() => opcionesCatalogo(cat), [cat]);
  const cambiar = (parte: Partial<Filtros>) => onChange({ ...f, ...parte });
  return (
    <div className="formulario-filtros" data-testid="formulario-filtros">
      <SelectorColeccion valor={f.coleccion} onChange={v => cambiar({ coleccion: v })} />
      <div className="field">
        <label>Tipo</label>
        <select className="input" value={f.tipo} onChange={e => cambiar({ tipo: e.target.value })} data-testid="filtro-tipo">
          <option value="">Todos</option>
          {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_ES[t] || t}</option>)}
        </select>
      </div>
      <SelectorTexto label="Ilustrador" valor={f.ilustrador} opciones={opciones.ilustradores.map(i => ({ id: i.nombre, texto: i.nombre, detalle: `${i.cartas} cartas` }))} placeholder="Buscar ilustrador…" onChange={v => cambiar({ ilustrador: v })} testid="filtro-ilustrador" />
      <div className="field">
        <label>Rareza</label>
        <select className="input" value={f.rareza} onChange={e => cambiar({ rareza: e.target.value })} data-testid="filtro-rareza">
          <option value="">Todas</option>
          {opciones.rarezas.map(r => <option key={r.id} value={r.id}>{rarezaLabel(r.id)}</option>)}
        </select>
      </div>
      <div className="fila-campos">
        <div className="field">
          <label>Idioma</label>
          <select className="input" value={f.idioma} onChange={e => cambiar({ idioma: e.target.value })} data-testid="filtro-idioma"><option value="">Todos</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
        </div>
        <div className="field">
          <label>Acabado</label>
          <select className="input" value={f.acabado} onChange={e => cambiar({ acabado: e.target.value })} data-testid="filtro-acabado"><option value="">Todos</option>{ACABADOS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}</select>
        </div>
      </div>
      <div className="field">
        <label>Estado</label>
        <select className="input" value={f.condicion} onChange={e => cambiar({ condicion: e.target.value })} data-testid="filtro-estado"><option value="">Todos</option>{CONDICIONES.filter(Boolean).map(c => <option key={c} value={c}>{ETIQUETA_CONDICION[c] || c}</option>)}</select>
      </div>
      <RangoPrecio min={f.min} max={f.max} onChange={(min, max) => cambiar({ min, max })} />
      {ambito === 'mercado' ? (
        <>
          <label className="check"><input type="checkbox" checked={f.foto} onChange={e => cambiar({ foto: e.target.checked })} data-testid="filtro-foto" /><span>Con foto real</span></label>
          <label className="check"><input type="checkbox" checked={f.reputacion} onChange={e => cambiar({ reputacion: e.target.checked })} data-testid="filtro-reputacion" /><span>Vendedor con buena reputación</span></label>
        </>
      ) : null}
      {ambito === 'coleccion' ? (
        <div className="field">
          <label>Dónde</label>
          <select className="input" value={f.donde} onChange={e => cambiar({ donde: e.target.value as Filtros['donde'] })} data-testid="filtro-donde"><option value="">Cualquiera</option><option value="album">En álbum</option><option value="bulk">En Bulk</option></select>
        </div>
      ) : null}
      {ambito !== 'mercado' ? (
        <div className="field">
          <label>En venta</label>
          <select className="input" value={f.venta} onChange={e => cambiar({ venta: e.target.value as Filtros['venta'] })} data-testid="filtro-venta"><option value="">Todas</option><option value="si">En venta</option><option value="no">No en venta</option></select>
        </div>
      ) : null}
      {extra}
      {cuentaFiltros(f) ? <button type="button" className="btn sm ghost" onClick={() => onChange({ ...FILTROS_VACIOS })} data-testid="btn-limpiar-formulario">Limpiar todo</button> : null}
    </div>
  );
}

/** Colección con buscador dentro de la lista (hay más de 300): se escribe y se elige; la elegida queda arriba con "quitar". */
function SelectorColeccion({ valor, onChange }: { valor: string; onChange: (id: string) => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState(false);
  const sets = useMemo(() => cat.sets.slice().sort((a, b) => (b.d || '').localeCompare(a.d || '')), [cat.sets]);
  const lista = useMemo(() => {
    const t = fold(q).replace(/-/g, '');
    const cumple = (s: Coleccion) => !t || (cat.setSearch.get(s.id) || '').includes(t);
    return sets.filter(cumple).slice(0, 30);
  }, [sets, q, cat]);
  const elegida = cat.coleccion(valor);
  return (
    <div className="field selector-coleccion" data-testid="filtro-coleccion">
      <label>Colección</label>
      {elegida ? (
        <div className="elegida"><span>{nombreColeccion(elegida, perfil.idioma_nombres, true)}</span><button type="button" className="btn icon sm ghost" onClick={() => onChange('')} aria-label="Quitar la colección" data-testid="quitar-coleccion"><Icono n="cerrar" tam={16} /></button></div>
      ) : (
        <>
          <input className="input" placeholder="Buscar colección…" value={q} onChange={e => { setQ(e.target.value); setAbierta(true); }} onFocus={() => setAbierta(true)} aria-label="Buscar colección" data-testid="buscar-coleccion" />
          {abierta ? (
            <div className="lista-opciones" role="listbox">
              {lista.map(s => <button key={s.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(s.id); setQ(''); setAbierta(false); }} data-testid="opcion-coleccion">{nombreColeccion(s, perfil.idioma_nombres, true)}<small>{s.d ? s.d.slice(0, 4) : ''}{s.rg === 'ja' ? ' · JP' : ''} · {cat.cartasDe(s.id).length} cartas</small></button>)}
              {!lista.length ? <div className="small muted" style={{ padding: 8 }}>Ninguna colección con ese nombre.</div> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Campo de texto con lista de opciones filtrada (ilustrador). */
function SelectorTexto({ label, valor, opciones, placeholder, onChange, testid }: { label: string; valor: string; opciones: { id: string; texto: string; detalle?: string }[]; placeholder: string; onChange: (v: string) => void; testid: string }) {
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState(false);
  const lista = useMemo(() => { const t = fold(q); return opciones.filter(o => !t || fold(o.texto).includes(t)).slice(0, 12); }, [opciones, q]);
  return (
    <div className="field selector-coleccion" data-testid={testid}>
      <label>{label}</label>
      {valor ? (
        <div className="elegida"><span>{valor}</span><button type="button" className="btn icon sm ghost" onClick={() => onChange('')} aria-label={`Quitar ${label.toLowerCase()}`} data-testid={`quitar-${testid}`}><Icono n="cerrar" tam={16} /></button></div>
      ) : (
        <>
          <input className="input" placeholder={placeholder} value={q} onChange={e => { setQ(e.target.value); setAbierta(true); }} onFocus={() => setAbierta(true)} aria-label={placeholder} data-testid={`buscar-${testid}`} />
          {abierta && q.trim() ? (
            <div className="lista-opciones" role="listbox">
              {lista.map(o => <button key={o.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(o.id); setQ(''); setAbierta(false); }} data-testid={`opcion-${testid}`}>{o.texto}{o.detalle ? <small>{o.detalle}</small> : null}</button>)}
              {!lista.length ? <div className="small muted" style={{ padding: 8 }}>Sin coincidencias.</div> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Precio mín.–máx. con deslizador doble (hasta S/ 500) y campos para escribir cualquier cifra. */
export function RangoPrecio({ min, max, onChange }: { min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void }) {
  const [txtMin, setTxtMin] = useState(min == null ? '' : String(min));
  const [txtMax, setTxtMax] = useState(max == null ? '' : String(max));
  useEffect(() => { setTxtMin(min == null ? '' : String(min)); setTxtMax(max == null ? '' : String(max)); }, [min, max]);
  const vMin = min ?? 0, vMax = max == null ? PRECIO_TOPE : Math.min(PRECIO_TOPE, max);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicar = (a: number | null, b: number | null) => { if (temporizador.current) clearTimeout(temporizador.current); temporizador.current = setTimeout(() => onChange(a, b), 250); };
  const num = (t: string): number | null => { if (t.trim() === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
  return (
    <div className="field rango-precio" data-testid="filtro-precio">
      <label>Precio (S/)</label>
      <div className="rango-doble" style={{ '--a': `${(vMin / PRECIO_TOPE) * 100}%`, '--b': `${(vMax / PRECIO_TOPE) * 100}%` } as React.CSSProperties}>
        <input type="range" min={0} max={PRECIO_TOPE} step={1} value={vMin} onChange={e => { const v = Math.min(Number(e.target.value), vMax); setTxtMin(String(v)); aplicar(v || null, max); }} aria-label="Precio mínimo" data-testid="precio-min-rango" />
        <input type="range" min={0} max={PRECIO_TOPE} step={1} value={vMax} onChange={e => { const v = Math.max(Number(e.target.value), vMin); setTxtMax(v >= PRECIO_TOPE ? '' : String(v)); aplicar(min, v >= PRECIO_TOPE ? null : v); }} aria-label="Precio máximo" data-testid="precio-max-rango" />
      </div>
      <div className="fila-campos">
        <input className="input" inputMode="decimal" placeholder="Mín." value={txtMin} onChange={e => { setTxtMin(e.target.value); aplicar(num(e.target.value), max); }} aria-label="Precio mínimo en soles" data-testid="precio-min" />
        <span className="muted">–</span>
        <input className="input" inputMode="decimal" placeholder="Máx." value={txtMax} onChange={e => { setTxtMax(e.target.value); aplicar(min, num(e.target.value)); }} aria-label="Precio máximo en soles" data-testid="precio-max" />
      </div>
    </div>
  );
}

/** Chip de un tipo de energía con su punto de color (para listas de resultados). */
export function ChipTipo({ tipo }: { tipo: string }) {
  return <span className="chip"><PuntoEnergia tipo={tipo} /> {TYPE_ES[tipo] || tipo}</span>;
}

export type { ClaveFiltro };
