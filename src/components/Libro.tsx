'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Icono, type NombreIcono } from './Icono';
import { usePerfil } from './PerfilProvider';
import { useCuadricula, type Cuadricula } from './useCuadricula';
import { useEsPC } from './ui';

// Mejoras 4 · A: la "carpeta" (libro) que usan el álbum por colección, los álbumes personalizados (bloque B) y la Pokédex
// (bloque C). Una sola fila de herramientas (miga, título, resumen compacto, filtros, cuadrícula, 1/2 páginas, Acciones,
// pantalla completa), "Página X de Y" con un selector "Ir a", y la hoja oscura con las flechas pegadas a los costados.
// La hoja se calcula con el alto y el ancho disponibles para que una página completa se vea sin bajar (PC y celular en
// horizontal); en el celular en vertical usa todo el ancho. Teclado ← → en PC, deslizar en el celular.

export type AccionLibro = { texto: string; icono?: NombreIcono; onClick?: () => void; href?: string; disabled?: boolean; testid?: string; primaria?: boolean };

export type LibroProps<T> = {
  items: T[];
  clave: (item: T) => string;
  celda: (item: T, indice: number) => ReactNode;
  /** Id para recordar la cuadrícula de este álbum (colección, álbum personalizado o 'pokedex'). */
  cuadriculaId: string;
  titulo: ReactNode;
  miga?: { href: string; texto: string };
  /** Fila compacta ("48 / 124 · 39 % · S/ 83.00"). */
  resumen?: ReactNode;
  filtros?: ReactNode;
  acciones?: AccionLibro[];
  /** Qué mostrar cuando no hay casillas (según el filtro). */
  vacio?: ReactNode;
  pagina: number;
  onPagina: (n: number) => void;
  /** Clave de la casilla que debe quedar a la vista (cambia de página si hace falta). */
  mostrarItem?: string | null;
  /** Casillas de la(s) página(s) siguiente(s), para precargar imágenes. */
  precargar?: (items: T[]) => void;
  /** Nombre de las casillas en "cartas a–b". */
  nombreUnidad?: string;
  /** Avisos u otros bloques entre las herramientas y la hoja. */
  antes?: ReactNode;
  /** Bloques bajo la hoja (solo celular). */
  despues?: ReactNode;
  /** Cuadrícula propia del álbum personalizado (columnas × filas con las que se creó): se ofrece como opción y es la inicial. */
  cuadriculaPropia?: { cols: number; filas: number } | null;
  /** Clase extra para el contenedor del libro. */
  className?: string;
};

export function Libro<T>({ items, clave, celda, cuadriculaId, titulo, miga, resumen, filtros, acciones, vacio, pagina, onPagina, mostrarItem, precargar, nombreUnidad = 'cartas', antes, despues, cuadriculaPropia, className = '' }: LibroProps<T>) {
  const { perfil } = usePerfil();
  const esPC = useEsPC();
  const { cuad, setCuad, opciones } = useCuadricula(perfil.id, cuadriculaId, esPC, cuadriculaPropia);
  const porPagina = cuad.cols * cuad.filas;
  const dosPaginas = esPC && cuad.paginas === 2;
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
  const libroRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const zonaRef = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number; t: number } | null>(null);
  const [completo, setCompleto] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // página válida: dentro del total y, con 2 páginas, impar a la izquierda
  useEffect(() => { if (pagina > totalPaginas) onPagina(totalPaginas); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pagina, totalPaginas]);
  useEffect(() => { if (dosPaginas && pagina % 2 === 0) onPagina(pagina - 1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dosPaginas, pagina]);
  const paso = dosPaginas ? 2 : 1;
  const mover = (n: number) => { const m = Math.max(1, Math.min(totalPaginas, n)); onPagina(dosPaginas && m % 2 === 0 ? m - 1 : m); };
  const paginasVista = (dosPaginas ? [pagina, pagina + 1] : [pagina]).filter(n => n <= totalPaginas);
  const celdasDe = (n: number) => items.slice((n - 1) * porPagina, n * porPagina);

  // la casilla pedida (p. ej. la siguiente vacía al agregar rápido) debe quedar a la vista
  useEffect(() => {
    if (!mostrarItem) return;
    const idx = items.findIndex(it => clave(it) === mostrarItem);
    if (idx < 0) return;
    const p = Math.floor(idx / porPagina) + 1;
    const visibles = dosPaginas ? [pagina, pagina + 1] : [pagina];
    if (!visibles.includes(p)) mover(p);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [mostrarItem, items, porPagina, dosPaginas]);

  // precarga de la(s) página(s) siguiente(s)
  useEffect(() => {
    if (!precargar) return;
    const siguientes = (dosPaginas ? [pagina + 2, pagina + 3] : [pagina + 1]).filter(n => n <= totalPaginas).flatMap(celdasDe);
    const t = setTimeout(() => precargar(siguientes), 500);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pagina, dosPaginas, porPagina, totalPaginas, items]);

  // teclado (PC): ← → pasan de página salvo escribiendo en un campo o con una hoja abierta
  useEffect(() => {
    if (!esPC) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('.sheet-backdrop')) return;
      if (e.key === 'ArrowLeft' && pagina > 1) { e.preventDefault(); mover(pagina - paso); }
      if (e.key === 'ArrowRight' && pagina + paso <= totalPaginas) { e.preventDefault(); mover(pagina + paso); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [esPC, pagina, paso, totalPaginas, dosPaginas]);

  // pantalla completa (solo la carpeta)
  useEffect(() => {
    const f = () => setCompleto(!!document.fullscreenElement && document.fullscreenElement === libroRef.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const alternarCompleto = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await libroRef.current?.requestFullscreen();
    } catch { /* el navegador no lo permite (p. ej. iOS) */ }
  };
  // menú Acciones: se cierra al tocar fuera o con Escape
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); document.removeEventListener('keydown', tecla); };
  }, [menu]);

  // tamaño de casilla: la(s) página(s) entran en el alto disponible (ventana menos lo que hay arriba) y en el ancho de la zona.
  // PC y celular en horizontal: alto y ancho; celular en vertical: solo el ancho (las casillas llenan la pantalla).
  useLayoutEffect(() => {
    const hoja = hojaRef.current, zona = zonaRef.current;
    if (!hoja || !zona) return;
    const medir = () => {
      const horizontal = window.innerWidth > window.innerHeight;
      const ajustarAlto = esPC || horizontal || !!document.fullscreenElement;
      const flechasFuera = esPC || horizontal;
      const rect = hoja.getBoundingClientRect();
      const arriba = rect.top + window.scrollY;
      // lo que hay debajo de la hoja (puntos de página, bloques de abajo y el relleno de la página) también tiene que entrar sin bajar
      const libroRect = libroRef.current?.getBoundingClientRect();
      const main = document.getElementById('main');
      const rellenoAbajo = main && !document.fullscreenElement ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const abajo = Math.max(0, (libroRect ? libroRect.bottom - rect.bottom : 0)) + rellenoAbajo;
      const altoDisp = document.fullscreenElement ? window.innerHeight - rect.top - abajo - 16 : window.innerHeight - arriba - abajo - 4;
      const anchoDisp = zona.clientWidth - (flechasFuera ? 2 * 68 : 0);
      const relleno = esPC ? 18 : 14, sep = esPC ? 12 : 10, separador = 2 * 18 + 2;
      const anchoPagina = dosPaginas ? (anchoDisp - 2 * relleno - separador) / 2 : anchoDisp - 2 * relleno;
      const porAncho = (anchoPagina - (cuad.cols - 1) * sep) / cuad.cols;
      const porAlto = ((altoDisp - 2 * relleno - (cuad.filas - 1) * sep) / cuad.filas) * 63 / 88;
      const celdaPx = Math.max(44, Math.floor(ajustarAlto ? Math.min(porAncho, porAlto) : porAncho));
      hoja.style.setProperty('--celda', `${celdaPx}px`);
      hoja.classList.toggle('compacta', celdaPx < 92);
      zona.classList.toggle('flechas-fuera', flechasFuera);
    };
    medir();
    window.addEventListener('resize', medir);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(zona);
    return () => { window.removeEventListener('resize', medir); ro?.disconnect(); };
  }, [esPC, dosPaginas, cuad.cols, cuad.filas, items.length, completo]);

  // deslizar (celular): horizontal, ≥ 50 px, rápido
  const tocarInicio = (e: React.TouchEvent) => { const t = e.touches[0]; if (t) toque.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const tocarFin = (e: React.TouchEvent) => {
    const ini = toque.current; toque.current = null;
    const t = e.changedTouches[0];
    if (!ini || !t) return;
    const dx = t.clientX - ini.x, dy = t.clientY - ini.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - ini.t > 800) return;
    mover(pagina + (dx < 0 ? paso : -paso));
  };

  const inicio = (pagina - 1) * porPagina;
  const rango = `${inicio + 1}–${Math.min(items.length, inicio + porPagina)}`;
  const textoPagina = paginasVista.length > 1 ? `Páginas ${paginasVista[0]} – ${paginasVista[1]} de ${totalPaginas}` : `Página ${pagina} de ${totalPaginas}`;
  const opcionesIr = Array.from({ length: totalPaginas }, (_, k) => k + 1).filter(n => !dosPaginas || n % 2 === 1);
  const seleccionIr = dosPaginas && pagina % 2 === 0 ? pagina - 1 : pagina;

  return (
    <div className={`libro ${completo ? 'libro-completo' : ''} ${className}`} ref={libroRef} data-testid="libro">
      <div className="libro-herramientas" data-testid="libro-herramientas">
        {miga ? <Link href={miga.href} className="miga solo-pc" data-testid="miga-albumes"><Icono n="izquierda" tam={16} /> {miga.texto}</Link> : null}
        <h1 className="titulo-album libro-titulo">{titulo}</h1>
        {resumen ? <div className="libro-resumen" data-testid="libro-resumen">{resumen}</div> : null}
        <div className="libro-controles">
          {filtros}
          {/* cuadrícula (columnas × filas) y, en PC, 1 o 2 páginas: selectores compactos para que todo quepa en una fila */}
          <select className="input sm selector-cuadricula" value={`${cuad.cols}x${cuad.filas}`} onChange={e => { const [c, f] = e.target.value.split('x').map(Number); setCuad({ cols: c, filas: f }); }} aria-label="Casillas por página" title="Casillas por página (columnas × filas)" data-testid="selector-cuadricula">
            {opciones.map(o => <option key={o.id} value={o.id}>{o.cols}×{o.filas}</option>)}
          </select>
          {esPC ? (
            <select className="input sm selector-paginas" value={cuad.paginas} onChange={e => setCuad({ paginas: Number(e.target.value) as 1 | 2 })} aria-label="Páginas a la vez" title="Páginas a la vez (con 2, hasta 4×4)" data-testid="selector-paginas">
              <option value={1}>1 página</option>
              <option value={2}>2 páginas</option>
            </select>
          ) : null}
          {acciones && acciones.length ? (
            <div className="menu-acciones" ref={menuRef}>
              <button type="button" className={`btn sm ${menu ? 'active' : ''}`} onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} data-testid="btn-acciones"><Icono n="mas_opciones" tam={18} /> Acciones <Icono n={menu ? 'arriba' : 'abajo'} tam={14} /></button>
              {menu ? (
                <div className="menu" role="menu" data-testid="menu-acciones">
                  {acciones.map((a, i) => a.href ? (
                    <Link key={i} href={a.href} role="menuitem" className={a.primaria ? 'primaria' : ''} onClick={() => setMenu(false)} data-testid={a.testid}>{a.icono ? <Icono n={a.icono} /> : null} {a.texto}</Link>
                  ) : (
                    <button key={i} type="button" role="menuitem" className={a.primaria ? 'primaria' : ''} disabled={a.disabled} onClick={() => { setMenu(false); a.onClick?.(); }} data-testid={a.testid}>{a.icono ? <Icono n={a.icono} /> : null} {a.texto}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" className="btn icon sm btn-completo" onClick={alternarCompleto} aria-label={completo ? 'Salir de pantalla completa' : 'Pantalla completa'} title={completo ? 'Salir de pantalla completa' : 'Pantalla completa: ver solo la carpeta'} data-testid="btn-pantalla-completa"><Icono n={completo ? 'pantalla_normal' : 'pantalla_completa'} tam={18} /></button>
        </div>
      </div>
      {antes}
      <div className="texto-pagina" data-testid="pagina-texto">
        <b>{textoPagina}</b><span className="small muted"> · {dosPaginas ? `${porPagina} casillas por página` : `${nombreUnidad} ${rango}`}</span>
        {totalPaginas > 1 ? <label className="ir-a small"><span className="muted">Ir a</span> <select className="input sm" value={seleccionIr} onChange={e => mover(Number(e.target.value))} aria-label="Ir a página" data-testid="ir-a-pagina">{opcionesIr.map(n => <option key={n} value={n}>{dosPaginas && n + 1 <= totalPaginas ? `${n}–${n + 1}` : n}</option>)}</select></label> : null}
      </div>
      {!items.length ? <div className="empty">{vacio || 'No hay casillas que mostrar.'}</div> : (
        <div className="zona-hoja" data-testid="zona-hoja" ref={zonaRef} onTouchStart={tocarInicio} onTouchEnd={tocarFin}>
          <button type="button" className="btn icon flecha-pagina izquierda" onClick={() => mover(pagina - paso)} disabled={pagina <= 1} aria-label={dosPaginas ? 'Páginas anteriores' : 'Página anterior'} title="Página anterior (← en el teclado)" data-testid="pagina-anterior"><Icono n="izquierda" tam={30} /></button>
          <div className={`hoja-carpeta ${paginasVista.length > 1 ? 'doble' : ''}`} data-testid="hoja-carpeta" data-cuadricula={`${cuad.cols}x${cuad.filas}`} ref={hojaRef} style={{ '--cols': cuad.cols } as React.CSSProperties}>
            {paginasVista.map(n => <div key={n} className="pagina-carpeta" data-pagina={n}>{celdasDe(n).map((it, i) => <span key={clave(it)} className="celda-libro">{celda(it, (n - 1) * porPagina + i)}</span>)}</div>)}
          </div>
          <button type="button" className="btn icon flecha-pagina derecha" onClick={() => mover(pagina + paso)} disabled={pagina + paso > totalPaginas} aria-label={dosPaginas ? 'Páginas siguientes' : 'Página siguiente'} title="Página siguiente (→ en el teclado)" data-testid="pagina-siguiente"><Icono n="derecha" tam={30} /></button>
        </div>
      )}
      {totalPaginas > 1 && totalPaginas <= 12 ? <div className="puntos-pagina solo-celular" aria-hidden="true">{Array.from({ length: totalPaginas }, (_, k) => <span key={k} className={k + 1 === pagina ? 'on' : ''} />)}</div> : null}
      {despues}
    </div>
  );
}

/** Cuadrícula actual de un libro (para calcular en qué página cae una casilla desde fuera). */
export type { Cuadricula };
