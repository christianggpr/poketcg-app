'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TYPE_ES, TYPE_ORDER, fold, nombreColeccion, rarezaLabel, type Coleccion } from '@/lib/catalogo';
import { tiendasActivas, type Tienda } from '@/lib/compras';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA } from '@/lib/config';
import { CLAVE_TIENDA_PREFERIDA, FILTROS_VACIOS, PRECIO_TOPE, chipsDe, cuentaFiltros, filtrosDeParams, opcionesCatalogo, paramsDeFiltros, quitarFiltro, type ClaveFiltro, type Filtros } from '@/lib/filtros';
import { useCatalogo } from './CatalogoProvider';
import { usePerfil } from './PerfilProvider';
import { Icono, PuntoEnergia } from './Icono';
import { Sheet } from './Sheet';
import { useEsPC } from './ui';

// Mejoras 4 · D y E · Mejoras 5 · C: filtros compartidos del Mercado (Explorar), de Mi Colección y del Bulk.
// PC: columna izquierda con el buscador (con cámara), "¿Quisiste decir…?" y la tarjeta "Filtros" (plegable);
// celular: botón "Filtros · N" junto al buscador que abre una hoja con "Limpiar" y "Ver N cartas".
// Los filtros activos se ven como chips quitables arriba de los resultados y viven en la dirección (?coleccion=…&tipo=…).

export type AmbitoFiltros = 'mercado' | 'coleccion' | 'bulk';

/** Filtros leídos de la dirección y una función que los escribe (conservando q, orden, faltan y vista; la página vuelve a la 1). */
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
    const p = paramsDeFiltros(nf, { q: params.get('q'), orden: params.get('orden'), faltan: params.get('faltan'), vista: params.get('vista') });
    router.replace(`${ruta}${p.toString() ? '?' + p.toString() : ''}`, { scroll: false });
  };
  return { f, setF, params: params as unknown as URLSearchParams };
}

const CLAVE_PLEGADO = 'poketcg:filtros-plegados';
const leerPlegado = (): boolean => { try { return localStorage.getItem(CLAVE_PLEGADO) === '1'; } catch { return false; } };

/** "Ver N cartas" del pie de la hoja (o "Ver resultados" mientras no se sabe cuántas). */
const textoVer = (total: number | null | undefined, unidad: string) => (total == null ? 'Ver resultados' : `Ver ${total.toLocaleString('es-PE')} ${total === 1 ? unidad.replace(/s$/, '') : unidad}`);

/**
 * Tarjeta "Filtros" (misma en la columna de PC, en el menú lateral de Mi Colección y, sin cabecera, en la hoja del celular):
 * cabecera con la cuenta y "Limpiar", el formulario y, en modo `aplicar`, los cambios se guardan como borrador hasta
 * pulsar "Aplicar filtros" (Explorar en PC: cada consulta va a la base).
 */
export function TarjetaFiltros({ ambito, f, onChange, aplicar = false, onPlegar, extraFormulario, sinCabecera = false, className = '' }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; aplicar?: boolean; onPlegar?: () => void; extraFormulario?: ReactNode; sinCabecera?: boolean; className?: string }) {
  const [borrador, setBorrador] = useState<Filtros>(f);
  const claveF = JSON.stringify(f);
  useEffect(() => { setBorrador(f); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [claveF]);
  const mostrado = aplicar ? borrador : f;
  const cambiar = aplicar ? setBorrador : onChange;
  const n = cuentaFiltros(f);
  const pendiente = aplicar && JSON.stringify(borrador) !== claveF;
  const limpiar = () => { setBorrador({ ...FILTROS_VACIOS }); onChange({ ...FILTROS_VACIOS }); };
  return (
    <section className={`panel-filtros ${className}`} data-testid="panel-filtros" aria-label="Filtros">
      {!sinCabecera ? (
        <div className="panel-filtros-cabecera">
          <b><Icono n="filtros" tam={18} /> Filtros{n ? <span className="pill info" style={{ marginLeft: 6 }} data-testid="cuenta-filtros">{n}</span> : null}</b>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="link" disabled={!n && !pendiente} onClick={limpiar} data-testid="btn-limpiar-formulario">Limpiar</button>
            {onPlegar ? <button type="button" className="btn icon sm ghost" onClick={onPlegar} aria-label="Plegar los filtros" title="Plegar" data-testid="btn-plegar-filtros"><Icono n="izquierda" tam={18} /></button> : null}
          </span>
        </div>
      ) : null}
      <FormularioFiltros ambito={ambito} f={mostrado} onChange={cambiar} extra={extraFormulario} />
      {aplicar ? (
        <div className="pie-panel-filtros">
          <button type="button" className="btn primary block" disabled={!pendiente} onClick={() => onChange(borrador)} data-testid="btn-aplicar-filtros">Aplicar filtros</button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Zona con filtros. PC: columna izquierda (buscador + tarjeta Filtros, plegable) y el contenido a la derecha; plegada, el
 * buscador y el botón "Filtros · N" pasan a la barra de arriba de los resultados. Celular: buscador y botón "Filtros · N" en
 * una fila; el botón abre la hoja con "Limpiar" y "Ver N cartas". `panelPC=false`: en PC no pone columna (la pone el menú
 * lateral de Mi Colección) y solo muestra los chips y el contenido.
 */
export function ConFiltros({ ambito, f, onChange, busqueda, barra, children, extraFormulario, aplicar = false, total, unidad = 'cartas', panelPC = true, columna, ancho = '' }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; busqueda?: ReactNode; barra?: ReactNode; children: ReactNode; extraFormulario?: ReactNode; aplicar?: boolean; total?: number | null; unidad?: string; panelPC?: boolean; /** contenido extra de la columna (debajo de los filtros) */ columna?: ReactNode; ancho?: '' | 'ancha' }) {
  const esPC = useEsPC();
  const [plegado, setPlegado] = useState(false);
  const [hoja, setHoja] = useState(false);
  useEffect(() => { setPlegado(leerPlegado()); }, []);
  const n = cuentaFiltros(f);
  const alternar = () => { setPlegado(p => { try { localStorage.setItem(CLAVE_PLEGADO, p ? '0' : '1'); } catch { /* sin almacenamiento */ } return !p; }); };
  const conColumna = esPC && panelPC && !plegado;
  const botonFiltros = (
    <button type="button" className={`btn btn-filtros ${n ? 'primary' : ''}`} onClick={() => (esPC && panelPC ? alternar() : setHoja(true))} aria-expanded={esPC && panelPC ? !plegado : hoja} data-testid="btn-filtros">
      <Icono n="filtros" tam={18} /> Filtros{n ? ` · ${n}` : ''}
    </button>
  );
  return (
    <div className={`con-filtros ${conColumna ? 'con-panel' : ''} ${ancho}`} data-testid="con-filtros">
      {conColumna ? (
        <aside className="columna-filtros" data-testid="columna-filtros">
          {busqueda}
          <TarjetaFiltros ambito={ambito} f={f} onChange={onChange} aplicar={aplicar} onPlegar={alternar} extraFormulario={extraFormulario} />
          {columna}
        </aside>
      ) : null}
      <div className="contenido-filtrado">
        {/* celular: buscador + "Filtros · N" (hoja); PC con la columna plegada: lo mismo, y el botón la vuelve a abrir */}
        {!esPC || (panelPC && plegado) ? <div className="fila-busqueda" data-testid="fila-busqueda">{busqueda}{botonFiltros}</div> : null}
        {barra ? <div className="barra-filtros">{barra}</div> : null}
        <ChipsFiltros f={f} onChange={onChange} />
        {children}
      </div>
      {hoja && !esPC ? (
        <HojaFiltros ambito={ambito} f={f} onChange={onChange} total={total} unidad={unidad} extraFormulario={extraFormulario} onClose={() => setHoja(false)} />
      ) : null}
    </div>
  );
}

/** Hoja inferior "Filtros · N" del celular: "Limpiar" arriba y "Ver N cartas" abajo. */
function HojaFiltros({ ambito, f, onChange, total, unidad, extraFormulario, onClose }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; total?: number | null; unidad: string; extraFormulario?: ReactNode; onClose: () => void }) {
  const n = cuentaFiltros(f);
  return (
    <Sheet titulo={`Filtros${n ? ` · ${n}` : ''}`} cabecera={n ? <button type="button" className="link" onClick={() => onChange({ ...FILTROS_VACIOS })} data-testid="btn-limpiar-filtros-hoja">Limpiar</button> : null} onClose={onClose} className="hoja-filtros"
      pie={<button type="button" className="btn primary grow" onClick={onClose} data-testid="btn-ver-resultados">{textoVer(total, unidad)}</button>}>
      <FormularioFiltros ambito={ambito} f={f} onChange={onChange} extra={extraFormulario} />
    </Sheet>
  );
}

/** Botón "Filtros · N" que abre la hoja con el formulario (Bulk: en PC y celular por igual, junto a la fila de chips). */
export function FiltrosEnHoja({ ambito, f, onChange, extraFormulario, total, unidad = 'cartas' }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; extraFormulario?: ReactNode; total?: number | null; unidad?: string }) {
  const [hoja, setHoja] = useState(false);
  const n = cuentaFiltros(f);
  return (
    <>
      <button type="button" className={`btn sm btn-filtros ${n ? 'primary' : ''}`} onClick={() => setHoja(true)} aria-expanded={hoja} data-testid="btn-filtros"><Icono n="filtros" tam={18} /> Filtros{n ? ` · ${n}` : ''}</button>
      {hoja ? <HojaFiltros ambito={ambito} f={f} onChange={onChange} total={total} unidad={unidad} extraFormulario={extraFormulario} onClose={() => setHoja(false)} /> : null}
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

/** Grupo de botones de una opción (Estado NM/LP/MP…, Dónde, En venta): tocar el activo lo quita. */
function BotonesOpcion({ label, valor, opciones, onChange, testid }: { label: string; valor: string; opciones: { id: string; texto: string; title?: string }[]; onChange: (v: string) => void; testid: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="botones-opcion" role="group" aria-label={label} data-testid={testid}>
        {opciones.map(o => <button key={o.id || 'todas'} type="button" className={`chipbtn ${valor === o.id ? 'active' : ''}`} aria-pressed={valor === o.id} title={o.title} onClick={() => onChange(valor === o.id && o.id ? '' : o.id)} data-testid={`${testid}-${o.id || 'todas'}`}>{o.texto}</button>)}
      </div>
    </div>
  );
}

/** El formulario de filtros (mismo en la columna de PC y en la hoja del celular), en el orden de las maquetas M5. */
export function FormularioFiltros({ ambito, f, onChange, extra }: { ambito: AmbitoFiltros; f: Filtros; onChange: (f: Filtros) => void; extra?: ReactNode }) {
  const cat = useCatalogo();
  const opciones = useMemo(() => opcionesCatalogo(cat), [cat]);
  const ilustradores = useMemo(() => opciones.ilustradores.map(i => ({ id: i.nombre, texto: i.nombre, detalle: `${i.cartas} cartas` })), [opciones]);
  const cambiar = (parte: Partial<Filtros>) => onChange({ ...f, ...parte });
  const campoColeccion = <SelectorColeccion valor={f.coleccion} onChange={v => cambiar({ coleccion: v })} />;
  const campoTipo = (
    <div className="field">
      <label>Tipo</label>
      <select className="input" value={f.tipo} onChange={e => cambiar({ tipo: e.target.value })} data-testid="filtro-tipo">
        <option value="">Todos</option>
        {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_ES[t] || t}</option>)}
      </select>
    </div>
  );
  const campoIlustrador = <SelectorTexto label="Ilustrador" valor={f.ilustrador} opciones={ilustradores} placeholder="Buscar ilustrador…" onChange={v => cambiar({ ilustrador: v })} testid="filtro-ilustrador" />;
  const campoRareza = (
    <div className="field">
      <label>Rareza</label>
      <select className="input" value={f.rareza} onChange={e => cambiar({ rareza: e.target.value })} data-testid="filtro-rareza">
        <option value="">Todas</option>
        {opciones.rarezas.map(r => <option key={r.id} value={r.id}>{rarezaLabel(r.id)}</option>)}
      </select>
    </div>
  );
  const campoIdioma = (
    <div className="field">
      <label>Idioma</label>
      <select className="input" value={f.idioma} onChange={e => cambiar({ idioma: e.target.value })} data-testid="filtro-idioma"><option value="">Todos</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
    </div>
  );
  const campoAcabado = (
    <div className="field">
      <label>Acabado</label>
      <select className="input" value={f.acabado} onChange={e => cambiar({ acabado: e.target.value })} data-testid="filtro-acabado"><option value="">Todos</option>{ACABADOS.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}</select>
    </div>
  );
  const campoEstado = <BotonesOpcion label="Estado" valor={f.condicion} opciones={CONDICIONES.filter(Boolean).map(c => ({ id: c, texto: c, title: ETIQUETA_CONDICION[c] || c }))} onChange={v => cambiar({ condicion: v })} testid="filtro-estado" />;
  const campoPrecio = <RangoPrecio min={f.min} max={f.max} onChange={(min, max) => cambiar({ min, max })} />;
  const campoVenta = <BotonesOpcion label="En venta" valor={f.venta} opciones={[{ id: '', texto: 'Todas' }, { id: 'si', texto: 'Sí' }, { id: 'no', texto: 'No' }]} onChange={v => cambiar({ venta: v as Filtros['venta'] })} testid="filtro-venta" />;
  return (
    <div className="formulario-filtros" data-testid="formulario-filtros">
      {ambito === 'mercado' ? (
        <>
          {campoPrecio}
          {campoIdioma}
          {campoColeccion}
          {campoTipo}
          {campoIlustrador}
          {campoRareza}
          {campoAcabado}
          {campoEstado}
          <PuntoDeEntrega />
          <label className="check"><input type="checkbox" checked={f.foto} onChange={e => cambiar({ foto: e.target.checked })} data-testid="filtro-foto" /><span>Solo con foto real</span></label>
          <label className="check"><input type="checkbox" checked={f.reputacion} onChange={e => cambiar({ reputacion: e.target.checked })} data-testid="filtro-reputacion" /><span>Vendedor con buena reputación</span></label>
        </>
      ) : (
        <>
          {ambito === 'coleccion' ? <BotonesOpcion label="Dónde" valor={f.donde} opciones={[{ id: '', texto: 'Todo' }, { id: 'album', texto: 'Álbumes' }, { id: 'bulk', texto: 'Bulk' }]} onChange={v => cambiar({ donde: v as Filtros['donde'] })} testid="filtro-donde" /> : null}
          {campoColeccion}
          {campoTipo}
          {campoIlustrador}
          {campoRareza}
          <div className="fila-campos">{campoIdioma}{campoAcabado}</div>
          {campoEstado}
          {campoPrecio}
          {campoVenta}
        </>
      )}
      {extra}
    </div>
  );
}

/**
 * "Punto de entrega" (Mejoras 5 · C): la tienda donde prefieres recoger tus compras. No filtra el mercado (cualquier vendedor
 * entrega en cualquier tienda aliada): se recuerda en este dispositivo y el carrito la deja elegida.
 */
function PuntoDeEntrega() {
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const [valor, setValor] = useState('');
  useEffect(() => {
    tiendasActivas().then(setTiendas).catch(() => setTiendas([]));
    try { setValor(localStorage.getItem(CLAVE_TIENDA_PREFERIDA) || ''); } catch { /* sin almacenamiento */ }
  }, []);
  if (tiendas && !tiendas.length) return null;
  return (
    <div className="field">
      <label>Punto de entrega</label>
      <select className="input" value={valor} onChange={e => { setValor(e.target.value); try { if (e.target.value) localStorage.setItem(CLAVE_TIENDA_PREFERIDA, e.target.value); else localStorage.removeItem(CLAVE_TIENDA_PREFERIDA); } catch { /* sin almacenamiento */ } }} aria-label="Punto de entrega" data-testid="filtro-tienda">
        <option value="">Todas las tiendas</option>
        {(tiendas || []).map(t => <option key={t.id} value={t.id}>{t.nombre}{t.distrito ? ` · ${t.distrito}` : ''}</option>)}
      </select>
      <span className="small muted">Dónde recogerás tus compras: queda elegida en el carrito.</span>
    </div>
  );
}

/** Colección con buscador dentro de la lista (hay más de 300): se escribe y se elige; la elegida queda arriba con "quitar". */
export function SelectorColeccion({ valor, onChange }: { valor: string; onChange: (id: string) => void }) {
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
export function SelectorTexto({ label, valor, opciones, placeholder, onChange, testid }: { label: string; valor: string; opciones: { id: string; texto: string; detalle?: string }[]; placeholder: string; onChange: (v: string) => void; testid: string }) {
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
      <div className="fila-campos">
        <input className="input" inputMode="decimal" placeholder="Mín." value={txtMin} onChange={e => { setTxtMin(e.target.value); aplicar(num(e.target.value), max); }} aria-label="Precio mínimo en soles" data-testid="precio-min" />
        <span className="muted">–</span>
        <input className="input" inputMode="decimal" placeholder="Máx." value={txtMax} onChange={e => { setTxtMax(e.target.value); aplicar(min, num(e.target.value)); }} aria-label="Precio máximo en soles" data-testid="precio-max" />
      </div>
      <div className="rango-doble" style={{ '--a': `${(vMin / PRECIO_TOPE) * 100}%`, '--b': `${(vMax / PRECIO_TOPE) * 100}%` } as React.CSSProperties}>
        <input type="range" min={0} max={PRECIO_TOPE} step={1} value={vMin} onChange={e => { const v = Math.min(Number(e.target.value), vMax); setTxtMin(String(v)); aplicar(v || null, max); }} aria-label="Precio mínimo" data-testid="precio-min-rango" />
        <input type="range" min={0} max={PRECIO_TOPE} step={1} value={vMax} onChange={e => { const v = Math.max(Number(e.target.value), vMin); setTxtMax(v >= PRECIO_TOPE ? '' : String(v)); aplicar(min, v >= PRECIO_TOPE ? null : v); }} aria-label="Precio máximo" data-testid="precio-max-rango" />
      </div>
    </div>
  );
}

/** Chip de un tipo de energía con su punto de color (para listas de resultados). */
export function ChipTipo({ tipo }: { tipo: string }) {
  return <span className="chip"><PuntoEnergia tipo={tipo} /> {TYPE_ES[tipo] || tipo}</span>;
}

export type { ClaveFiltro };
