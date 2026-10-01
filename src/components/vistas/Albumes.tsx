'use client';
import { Icono } from '../Icono';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { idiomaImagen, nombreCarta, nombreColeccion, urlsImagen } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { IDIOMAS_CARTA } from '@/lib/config';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { usePedirPrecios } from '../Precio';
import { Confirmar } from '../Sheet';
import { useMercado } from '../MercadoProvider';
import { resumenMercado, type ResumenCarta } from '@/lib/mercado';
import { AddEntrySheet } from '../AddEntrySheet';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { PorLlegar, Recibidas } from './PorLlegar';
import { AvisosOrdenar, LlenarAlbumesSheet, OrdenarRepetidasSheet, useOrdenar } from './Repetidas';
import { PonerEnVentaSheet } from './VentaAlbum';
import { useEsPC } from '../ui';
import { EditorAlbumPropio } from '../EditorAlbumPropio';
import { PortadaColeccion, PortadaPropia } from '../Portadas';
import { useCuadricula } from '../useCuadricula';

/** Idioma de una entrada para agrupar álbumes: JP para colecciones japonesas, el registrado o "—". */
function idiomaAlbum(e: Entrada, set: Coleccion | undefined): string {
  if (set?.rg === 'ja') return 'JP';
  return e.idioma || '—';
}

type AlbumAuto = { set: Coleccion; idioma: string; entradas: Entrada[]; distintas: number; total: number };

function useAlbumesAuto(): AlbumAuto[] {
  const cat = useCatalogo();
  const col = useColeccion();
  return useMemo(() => {
    const m = new Map<string, AlbumAuto>();
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c) continue;
      const set = cat.setOf(c);
      if (!set) continue;
      const idioma = idiomaAlbum(e, set);
      const key = set.id + '|' + idioma;
      let a = m.get(key);
      if (!a) { a = { set, idioma, entradas: [], distintas: 0, total: cat.cartasDe(set.id).filter(c => !c.sd).length }; m.set(key, a); }
      a.entradas.push(e);
    }
    for (const a of m.values()) a.distintas = new Set(a.entradas.map(e => e.carta_id)).size;
    return [...m.values()].sort((a, b) => (b.set.d || '').localeCompare(a.set.d || '') || a.idioma.localeCompare(b.idioma));
  }, [cat, col.entradas]);
}

export function Albumes() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const toast = useToast();
  const router = useRouter();
  const albumes = useAlbumesAuto();
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'coleccion' | 'propios'>('todos');
  const idioma = perfil.idioma_nombres;
  // precio de cada álbum: Σ precio por defecto × cantidad de sus cartas (los precios ya se piden para toda la colección)
  const precioDe = (entradas: Entrada[]) => { let t = 0; for (const e of entradas) { const c = cat.carta(e.carta_id); if (c && !c.sd) t += precios.precioDefecto(c, e.acabado).pen * e.cantidad; } return t; };
  const propios = col.albumes.map(a => {
    const cas = col.casillas.filter(c => c.album_id === a.id);
    const entradas = cas.map(c => col.entradas.find(e => e.id === c.entrada_id)).filter((e): e is Entrada => !!e);
    const capacidad = a.paginas * a.columnas * a.filas;
    return { album: a, cartas: entradas.reduce((n, e) => n + e.cantidad, 0), asignadas: cas.filter(c => c.carta_id || c.entrada_id).length, capacidad, precio: precioDe(entradas) };
  });
  const verColeccion = filtro !== 'propios', verPropios = filtro !== 'coleccion';
  const vacio = !albumes.length && !col.albumes.length;
  return (
    <div>
      <div className="solo-celular"><PorLlegar /></div>
      <Recibidas />
      <AvisosOrdenar />
      <div className="cabecera-seccion">
        <h2 style={{ margin: 0 }}>Mis álbumes</h2>
        <div className="acciones">
          <div className="seg solo-pc" data-testid="filtro-albumes">
            <button className={filtro === 'todos' ? 'active' : ''} onClick={() => setFiltro('todos')}>Todos</button>
            <button className={filtro === 'coleccion' ? 'active' : ''} onClick={() => setFiltro('coleccion')}>Por colección</button>
            <button className={filtro === 'propios' ? 'active' : ''} onClick={() => setFiltro('propios')}>Propios</button>
          </div>
          <button className="btn primary sm" onClick={() => setNuevo(true)} data-testid="btn-nuevo-album"><Icono n="mas" /> Nuevo álbum</button>
        </div>
      </div>
      {vacio ? <div className="empty"><div className="big"><Icono n="album" tam={44} grosor={1.5} /></div><p><b>Todavía no tienes álbumes.</b></p><p className="muted">Los álbumes por colección se crean solos cuando guardas cartas (uno por colección e idioma). Un álbum propio es una carpeta con páginas de bolsillos (por ejemplo 3 × 3) a la que asignas las cartas que van en cada bolsillo.</p></div> : null}
      <div className="album-grid">
        {verColeccion ? albumes.map(a => {
          const pct = a.total ? Math.round((a.distintas / a.total) * 100) : 0;
          return (
            <Link key={a.set.id + a.idioma} href={`/app/album/${encodeURIComponent(a.set.id)}?idioma=${encodeURIComponent(a.idioma)}`} className="album-card" data-testid="album-coleccion">
              <PortadaColeccion set={a.set} />
              <div className="album-body">
                <div className="album-title"><span className="nombre">{nombreColeccion(a.set, idioma)}</span>{a.idioma === '—' ? <span className="pill" title="Cartas registradas sin idioma">sin idioma</span> : <span className={`pill ${a.idioma === 'JP' ? 'jp' : 'info'}`}>{a.idioma}</span>}</div>
                <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
                <div className="album-foot-card"><span>{a.distintas} / {a.total}</span><span>{fmtPen(precioDe(a.entradas))}</span></div>
              </div>
            </Link>
          );
        }) : null}
        {verPropios ? propios.map(({ album: a, cartas, asignadas, capacidad, precio }) => (
          <Link key={a.id} href={`/app/album/p/${a.id}`} className="album-card" data-testid="album-propio">
            <PortadaPropia nombre={a.nombre} color={a.color} marca={a.marca_agua} />
            <div className="album-body">
              <div className="album-title"><span className="nombre">{a.nombre}</span><span className="pill warn">Propio</span></div>
              <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={capacidad ? Math.round((asignadas / capacidad) * 100) : 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: (capacidad ? Math.round((asignadas / capacidad) * 100) : 0) + '%' }} /></div>
              <div className="album-foot-card"><span>{cartas} {cartas === 1 ? 'carta' : 'cartas'}</span><span>{fmtPen(precio)}</span></div>
            </div>
          </Link>
        )) : null}
      </div>
      {nuevo ? (
        <EditorAlbumPropio titulo="Nuevo álbum personalizado" okLabel="Crear álbum" onClose={() => setNuevo(false)}
          onGuardar={async d => { const a = await col.crearAlbum(d); if (a) { toast('Álbum creado', 'ok'); router.push(`/app/album/p/${a.id}`); } return !!a; }} />
      ) : null}
    </div>
  );
}

/**
 * Álbum de una colección (en un idioma) como hoja de carpeta.
 * Ajustes de layout 2 · 4: la cuadrícula se elige (3×3, 3×4, 4×4, 4×5, 4×6; en el celular 3×3, 3×4 y 4×5) y en PC se ven 1 o
 * 2 páginas lado a lado; por defecto PC 4×5 en 1 página y celular 3×3. La elección se recuerda por usuario y por álbum.
 * En PC la hoja se dimensiona para que una página completa entre en la ventana sin bajar (alto disponible) y usa el ancho que haga falta.
 */
export function AlbumColeccion({ setId }: { setId: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const params = useSearchParams();
  const router = useRouter();
  const esPC = useEsPC();
  const idiomaAlb = params.get('idioma') || '';
  const [modo, setModo] = useState<'todas' | 'tengo' | 'faltan'>('todas');
  const [pagina, setPagina] = useState(1);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [consultarFaltan, setConsultarFaltan] = useState(false);
  const [idiomaNuevo, setIdiomaNuevo] = useState('ES');
  const [asignando, setAsignando] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
  const [asistente, setAsistente] = useState<'repetidas' | 'llenar' | null>(null);
  const ordenar = useOrdenar(setId);
  const [enRed, setEnRed] = useState<Map<string, ResumenCarta>>(new Map());
  const mercado = useMercado();
  const toast = useToast();
  const set = cat.coleccion(setId);
  const { cuad, setCuad, opciones } = useCuadricula(perfil.id, set?.id, esPC);
  const porPagina = cuad.cols * cuad.filas;
  const dosPaginas = esPC && cuad.paginas === 2;
  const hojaRef = useRef<HTMLDivElement>(null);
  const zonaRef = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number; t: number } | null>(null);
  // Fase 2 · C: qué cartas de esta colección están en venta en la red (se actualiza en tiempo real)
  useEffect(() => {
    if (!set) return;
    let vivo = true;
    resumenMercado({ set: set.id, limite: 500, orden: 'precio' }).then(r => { if (vivo) setEnRed(new Map(r.map(x => [x.carta_id, x]))); }).catch(() => {});
    return () => { vivo = false; };
  }, [set, mercado.version]);
  const idioma = perfil.idioma_nombres;
  const cartas = useMemo(() => (set ? cat.cartasDe(set.id) : []), [cat, set]);
  const propias = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of col.entradas) {
      if (!e.carta_id || !set) continue;
      const c = cat.carta(e.carta_id);
      if (!c || c.s !== set.id) continue;
      if (idiomaAlb && idiomaAlbum(e, set) !== idiomaAlb) continue;
      const l = m.get(e.carta_id) || []; l.push(e); m.set(e.carta_id, l);
    }
    return m;
  }, [col.entradas, cat, set, idiomaAlb]);
  const idsPropias = useMemo(() => [...propias.keys()], [propias]);
  const idsFaltan = useMemo(() => cartas.filter(c => !propias.has(c.id) && !c.sd).map(c => c.id), [cartas, propias]);
  usePedirPrecios(consultarFaltan ? [...idsPropias, ...idsFaltan] : idsPropias);

  const stats = useMemo(() => {
    let valor = 0, faltaPen = 0, faltaConPrecio = 0;
    for (const [id, es] of propias) { const c = cat.carta(id); if (!c || c.sd) continue; for (const e of es) valor += precios.precioDefecto(c, e.acabado).pen * e.cantidad; }
    for (const id of idsFaltan) { const c = cat.carta(id); if (!c) continue; const d = precios.precioDefecto(c, ''); faltaPen += d.pen; if (d.mercado) faltaConPrecio++; }
    return { valor: Math.round(valor * 100) / 100, faltaPen: Math.round(faltaPen * 100) / 100, faltaConPrecio };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [propias, idsFaltan, cat, precios.version]);
  const lista = useMemo(() => modo === 'tengo' ? cartas.filter(c => propias.has(c.id)) : modo === 'faltan' ? cartas.filter(c => !propias.has(c.id)) : cartas, [cartas, propias, modo]);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
  useEffect(() => { setPagina(1); }, [modo]);
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas); }, [pagina, totalPaginas]);
  // con 2 páginas lado a lado, la de la izquierda siempre es impar (como en una carpeta real)
  useEffect(() => { if (dosPaginas && pagina % 2 === 0) setPagina(pagina - 1); }, [dosPaginas, pagina]);
  const paso = dosPaginas ? 2 : 1;
  const mover = (n: number) => { const m = Math.max(1, Math.min(totalPaginas, n)); setPagina(dosPaginas && m % 2 === 0 ? m - 1 : m); };
  // Ajustes de layout 2 · 5 (PC): flechas del teclado ← → pasan de página (salvo escribiendo en un campo o con una hoja abierta)
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
  // Mejoras 2 · A: se precargan en segundo plano las imágenes de la página siguiente (la hoja pasa sin esperar)
  useEffect(() => {
    if (!set || typeof window === 'undefined') return;
    const siguientes = (dosPaginas ? [pagina + 2, pagina + 3] : [pagina + 1]).filter(n => n <= totalPaginas).flatMap(n => lista.slice((n - 1) * porPagina, n * porPagina));
    const t = setTimeout(() => { for (const c of siguientes) { const u = urlsImagen(c, set, idiomaImagen(idiomaAlb))[0]; if (u) { const im = new Image(); im.decoding = 'async'; im.src = u; } } }, 500);
    return () => clearTimeout(t);
  }, [pagina, dosPaginas, porPagina, totalPaginas, lista, set, idiomaAlb]);
  // Ajustes de layout 2 · 4 (PC): tamaño de casilla para que la(s) página(s) entren en el alto de la ventana y en el ancho disponible
  useLayoutEffect(() => {
    const hoja = hojaRef.current, zona = zonaRef.current;
    if (!hoja) return;
    if (!esPC || !zona) { hoja.style.removeProperty('--celda'); return; }
    const medir = () => {
      const rect = hoja.getBoundingClientRect();
      const arriba = rect.top + window.scrollY;                       // distancia desde el inicio del documento
      const altoDisp = window.innerHeight - arriba - 24;              // margen inferior
      const anchoDisp = zona.clientWidth - 2 * 68;                    // menos las flechas de los costados (56 px + separación)
      const relleno = 18, sep = 12, separador = 2 * 18 + 2;           // padding de la hoja, separación entre casillas, lomo entre dos páginas
      const anchoPagina = (dosPaginas ? (anchoDisp - 2 * relleno - separador) / 2 : anchoDisp - 2 * relleno);
      const porAncho = (anchoPagina - (cuad.cols - 1) * sep) / cuad.cols;
      const porAlto = ((altoDisp - 2 * relleno - (cuad.filas - 1) * sep) / cuad.filas) * 63 / 88;
      const celda = Math.max(48, Math.floor(Math.min(porAncho, porAlto)));
      hoja.style.setProperty('--celda', `${celda}px`);
      hoja.classList.toggle('compacta', celda < 92);   // casillas chicas: rótulos más pequeños
    };
    medir();
    window.addEventListener('resize', medir);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    ro?.observe(zona);
    return () => { window.removeEventListener('resize', medir); ro?.disconnect(); };
  }, [esPC, dosPaginas, cuad.cols, cuad.filas, lista.length, modo]);

  if (!set) return <div className="empty">Esa colección no existe. <Link href="/app/album">Volver</Link></div>;
  const sinIdioma = idiomaAlb === '—' ? [...propias.values()].flat() : [];
  async function asignarIdioma() {
    setAsignando(true);
    const n = await col.editarVarias(sinIdioma.map(e => e.id), { idioma: idiomaNuevo });
    setAsignando(false);
    toast(`${n} ${n === 1 ? 'carta marcada' : 'cartas marcadas'} como ${idiomaNuevo}`, 'ok');
    router.replace(`/app/album/${encodeURIComponent(set!.id)}?idioma=${encodeURIComponent(idiomaNuevo)}`);
  }
  const sinPublicar = [...propias.values()].flat().filter(e => !col.publicacionDe(e.id));
  const total = cartas.filter(c => !c.sd).length;
  const pct = total ? Math.round((idsPropias.length / total) * 100) : 0;
  const enVentaFaltan = idsFaltan.filter(id => enRed.has(id)).length;
  // PC con "2 páginas" muestra impar + par; si no, una. Las páginas se numeran igual en todos los modos.
  const inicioPagina = (pagina - 1) * porPagina;
  const paginasVista = (dosPaginas ? [pagina, pagina + 1] : [pagina]).filter(n => n <= totalPaginas);
  const celdas = (n: number) => lista.slice((n - 1) * porPagina, n * porPagina);
  const irA = mover;
  // Ajustes de layout 2 · 5 (celular): deslizar con el dedo sobre la hoja pasa de página (horizontal, ≥ 50 px, rápido)
  const tocarInicio = (e: React.TouchEvent) => { const t = e.touches[0]; if (t) toque.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const tocarFin = (e: React.TouchEvent) => {
    const ini = toque.current; toque.current = null;
    const t = e.changedTouches[0];
    if (!ini || !t) return;
    const dx = t.clientX - ini.x, dy = t.clientY - ini.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - ini.t > 800) return;
    mover(pagina + (dx < 0 ? paso : -paso));
  };
  const rangoCartas = `${inicioPagina + 1}–${Math.min(lista.length, inicioPagina + porPagina)}`;
  const textoPagina = paginasVista.length > 1 ? `Páginas ${paginasVista[0]} – ${paginasVista[1]} de ${totalPaginas}` : `Página ${pagina} de ${totalPaginas}`;
  // Selector de cuadrícula (y de 1 o 2 páginas en PC), junto a los filtros Todas / Tengo / Faltan
  const selectorCuadricula = (sufijo: '' | '-pc') => (
    <div className="seg selector-cuadricula" role="group" aria-label="Casillas por página" data-testid={`selector-cuadricula${sufijo}`}>
      {opciones.map(o => <button key={o.id} className={cuad.cols === o.cols && cuad.filas === o.filas ? 'active' : ''} onClick={() => setCuad({ cols: o.cols, filas: o.filas })} title={`${o.cols} columnas × ${o.filas} filas (${o.cols * o.filas} casillas por página)`} aria-pressed={cuad.cols === o.cols && cuad.filas === o.filas} data-testid={`cuadricula-${o.id}${sufijo}`}>{o.cols}×{o.filas}</button>)}
    </div>
  );
  const selectorPaginas = esPC ? (
    <div className="seg selector-paginas" role="group" aria-label="Páginas a la vez" data-testid="selector-paginas">
      <button className={cuad.paginas === 1 ? 'active' : ''} onClick={() => setCuad({ paginas: 1 })} aria-pressed={cuad.paginas === 1} data-testid="paginas-1">1 página</button>
      <button className={cuad.paginas === 2 ? 'active' : ''} onClick={() => setCuad({ paginas: 2 })} aria-pressed={cuad.paginas === 2} title="Dos páginas lado a lado (hasta 4×4)" data-testid="paginas-2">2 páginas</button>
    </div>
  ) : null;
  const Celda = ({ c }: { c: Carta }) => {
    const es = propias.get(c.id) || [];
    const qty = es.reduce((n, e) => n + e.cantidad, 0);
    // Mejoras 2 · B: la casilla guarda 1 copia; las copias de más en la casilla son repetidas (asistente) y las del Bulk se cuentan aparte
    const enCasilla = es.filter(e => e.album_coleccion === set.id).reduce((n, e) => n + e.cantidad, 0);
    const otras = qty - enCasilla;
    const red = enRed.get(c.id);
    const pubs = es.filter(e => e.album_coleccion === set.id).map(e => col.publicacionDe(e.id)).filter((p): p is NonNullable<typeof p> => !!p && (p.estado === 'activa' || p.estado === 'pausada'));
    const enVenta = pubs.length > 0;
    // Mejoras 2 · C: copias de la casilla puestas a la venta ("en el álbum, para vender")
    const paraVender = pubs.reduce((n, p) => n + p.cantidad, 0);
    const titulo = `${nombreCarta(c, idioma)} · ${c.l}${qty ? ` · tienes ${qty}${enCasilla > 1 ? ` (${enCasilla - 1} repetidas en la casilla)` : ''}${otras ? ` (${otras} en Bulk)` : ''}${paraVender ? ` · ${paraVender} en el álbum, para vender` : ''}` : red ? ` · en el mercado desde ${fmtPen(red.precio_min)}` : ' · te falta'}`;
    if (qty) {
      return (
        <Link href={`/app/carta/${encodeURIComponent(c.id)}`} className="pocket filled album-cell" title={titulo} data-testid="casilla-tengo">
          <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
          <span className="pocket-n">{c.l}</span>
          {enCasilla > 1 ? <span className="casilla-cant repetida" title={`${enCasilla - 1} repetidas en la casilla: usa "Ordenar repetidas"`}>×{enCasilla}</span> : otras ? <span className="casilla-cant bulk" title={`${otras} más en Bulk`}>+{otras}</span> : null}
          {enVenta ? <span className="album-venta" title={paraVender && enCasilla > 1 ? `${paraVender} ${paraVender === 1 ? 'copia' : 'copias'} en el álbum, para vender` : 'En venta en el mercado'} data-testid="casilla-venta">{<Icono n="ventas" tam={11} />}{enCasilla > 1 ? <span className="n"> {paraVender}</span> : null}</span> : null}
          <span className="casilla-loc">{(() => { const d = ubicador.donde(es[0]); return d ? <LocChip loc={d} corto /> : null; })()}</span>
        </Link>
      );
    }
    return (
      <Link href={`/app/carta/${encodeURIComponent(c.id)}#mercado`} className="pocket missing album-cell" title={titulo} data-testid="casilla-falta" onClick={e => { if (c.sd) { e.preventDefault(); setAgregar(c); } }}>
        <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
        <span className="pocket-n">{c.l}</span>
        <span className="casilla-falta">{red ? <span className="casilla-mercado album-red">En mercado · {fmtPen(red.precio_min)}</span> : <span className="casilla-sin">Sin stock</span>}</span>
      </Link>
    );
  };

  const tarjetaProgreso = (
    <div className="panel progreso-album" data-testid="progreso-album">
      <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="precio-grande">{idsPropias.length}</span><span className="muted" style={{ fontWeight: 700 }}>de {total} · {pct} %</span></div>
      <div className="bar" style={{ margin: '8px 0 10px' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
      <div className="fila-dato"><span className="muted">Precio del álbum</span><b>{fmtPen(stats.valor)}</b></div>
      <div className="fila-dato"><span className="muted">Para completarlo</span><b>{consultarFaltan ? <>{fmtPen(stats.faltaPen)}{stats.faltaConPrecio < idsFaltan.length ? <span className="small muted"> ({stats.faltaConPrecio} con precio de mercado)</span> : null}</> : idsFaltan.length ? <button className="link" onClick={() => setConsultarFaltan(true)}>Consultar el precio de las que faltan</button> : '—'}</b></div>
    </div>
  );
  const botones = (
    <div className="stack botones-album">
      <Link href={`/app/buscar?q=${encodeURIComponent(set.id)}`} className="btn primary" data-testid="btn-agregar-carta"><Icono n="mas" /> Agregar carta</Link>
      {idsFaltan.length ? <Link href={`/app/mercado?set=${encodeURIComponent(set.id)}&faltan=1`} className="btn" data-testid="faltan-mercado">Comprar faltantes en el mercado{enVentaFaltan ? ` (${enVentaFaltan} en venta)` : ''}</Link> : null}
      {idsPropias.length ? (sinPublicar.length ? <button className="btn" disabled={asignando} onClick={() => setConfirmarVenta(true)} data-testid="btn-poner-en-venta">Poner en venta… ({sinPublicar.length})</button> : <span className="small muted" style={{ textAlign: 'center' }}>Todo lo que tienes de esta colección está en el mercado.</span>) : null}
      {ordenar.copiasRepetidas ? <button className="btn" onClick={() => setAsistente('repetidas')} data-testid="btn-ordenar-repetidas-album"><Icono n="bulk" /> Ordenar repetidas ({ordenar.copiasRepetidas})</button> : null}
      {ordenar.candidatas.length ? <button className="btn" onClick={() => setAsistente('llenar')} data-testid="btn-llenar-album"><Icono n="album" /> Traer del Bulk ({ordenar.candidatas.length})</button> : null}
    </div>
  );
  // "Ir a página" se adapta al número de páginas de la cuadrícula elegida (hasta 10 botones alrededor de la actual)
  const irAPagina = totalPaginas > 1 ? (
    <div className="panel ir-a-pagina solo-pc-block" data-testid="ir-a-pagina">
      <b>Ir a página</b> <span className="small muted">({totalPaginas} páginas de {porPagina})</span>
      <div className="paginas">
        {(() => { const ini = Math.max(1, Math.min(pagina - 4, totalPaginas - 9)); const fin = Math.min(totalPaginas, ini + 9); const out = []; for (let n = ini; n <= fin; n++) out.push(<button key={n} className={paginasVista.includes(n) ? 'active' : ''} onClick={() => irA(n)} aria-current={paginasVista.includes(n) ? 'page' : undefined}>{n}</button>); return out; })()}
      </div>
    </div>
  ) : null;

  return (
    <div className="album-detalle">
      <div className="cabecera-seccion cabecera-album">
        {/* Ajustes de layout 2 · 4: la miga «Mis álbumes» va en la misma fila que el título para dejarle más alto a la hoja */}
        <Link href="/app/album" className="miga solo-pc" data-testid="miga-albumes"><Icono n="izquierda" tam={16} /> Mis álbumes</Link>
        <h1 className="titulo-album" style={{ margin: 0 }}>{nombreColeccion(set, idioma, true)}{idiomaAlb && idiomaAlb !== '—' ? <span className={`pill ${idiomaAlb === 'JP' ? 'jp' : 'info'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{idiomaAlb}</span> : null}</h1>
        <div className="controles-album solo-pc-flex">
          <div className="seg filtro-album" data-testid="filtro-album-pc">
            <button className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
            <button className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {idsPropias.length}</button>
            <button className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {idsFaltan.length}</button>
          </div>
          {selectorCuadricula('-pc')}
          {selectorPaginas}
        </div>
      </div>
      {sinIdioma.length ? (
        <div className="notice info" style={{ marginBottom: 10 }}>
          Estas {sinIdioma.length} {sinIdioma.length === 1 ? 'carta no tiene' : 'cartas no tienen'} idioma registrado. Si todas son del mismo idioma, márcalo aquí y este álbum se unirá con el de ese idioma:
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <select className="input sm" value={idiomaNuevo} onChange={e => setIdiomaNuevo(e.target.value)}>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
            <button className="btn sm primary" disabled={asignando} onClick={asignarIdioma}>{asignando ? 'Guardando…' : `Marcar todas como ${idiomaNuevo}`}</button>
          </div>
        </div>
      ) : null}
      <div className="album-cuerpo">
        <div className="album-principal" ref={zonaRef}>
          <div className="solo-celular">{tarjetaProgreso}</div>
          <div className="controles-album solo-celular" style={{ marginBottom: 10 }}>
            <div className="seg filtro-album" data-testid="filtro-album">
              <button className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
              <button className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {idsPropias.length}</button>
              <button className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {idsFaltan.length}</button>
            </div>
            {selectorCuadricula('')}
          </div>
          {/* Ajustes de layout 2 · 5: "Página X de Y" pequeño arriba; flechas grandes a los costados de la hoja (teclado ← → en PC, deslizar en el celular) */}
          <div className="texto-pagina" data-testid="pagina-texto"><b>{textoPagina}</b><span className="small muted"> · {dosPaginas ? `${porPagina} casillas por página` : `cartas ${rangoCartas}`}</span></div>
          {!lista.length ? <div className="empty">{modo === 'faltan' ? '¡No te falta ninguna!' : modo === 'tengo' ? 'Todavía no tienes cartas de esta colección.' : 'Esta colección no tiene cartas en el catálogo.'}</div> : (
            <div className="zona-hoja" data-testid="zona-hoja" onTouchStart={tocarInicio} onTouchEnd={tocarFin}>
              <button type="button" className="btn icon flecha-pagina izquierda" onClick={() => irA(pagina - paso)} disabled={pagina <= 1} aria-label={dosPaginas ? 'Páginas anteriores' : 'Página anterior'} title="Página anterior (← en el teclado)" data-testid="pagina-anterior"><Icono n="izquierda" tam={30} /></button>
              <div className={`hoja-carpeta ${paginasVista.length > 1 ? 'doble' : ''}`} data-testid="hoja-carpeta" data-cuadricula={`${cuad.cols}x${cuad.filas}`} ref={hojaRef} style={{ '--cols': cuad.cols } as React.CSSProperties}>
                {paginasVista.map(n => <div key={n} className="pagina-carpeta" data-pagina={n}>{celdas(n).map(c => <Celda key={c.id} c={c} />)}</div>)}
              </div>
              <button type="button" className="btn icon flecha-pagina derecha" onClick={() => irA(pagina + paso)} disabled={pagina + paso > totalPaginas} aria-label={dosPaginas ? 'Páginas siguientes' : 'Página siguiente'} title="Página siguiente (→ en el teclado)" data-testid="pagina-siguiente"><Icono n="derecha" tam={30} /></button>
            </div>
          )}
          {totalPaginas > 1 && totalPaginas <= 12 ? <div className="puntos-pagina solo-celular" aria-hidden="true">{Array.from({ length: totalPaginas }, (_, k) => <span key={k} className={k + 1 === pagina ? 'on' : ''} />)}</div> : null}
          <div className="solo-celular" style={{ marginTop: 14 }}>{botones}</div>
        </div>
        <aside className="album-lateral" data-testid="album-lateral">
          {tarjetaProgreso}
          {botones}
          {irAPagina}
        </aside>
      </div>
      {agregar ? <AddEntrySheet carta={agregar} idiomaInicial={idiomaAlb !== '—' ? idiomaAlb : ''} onClose={() => setAgregar(null)} /> : null}
      {asistente === 'repetidas' ? <OrdenarRepetidasSheet repetidas={ordenar.repetidas} onClose={() => setAsistente(null)} /> : null}
      {asistente === 'llenar' ? <LlenarAlbumesSheet candidatas={ordenar.candidatas} onClose={() => setAsistente(null)} /> : null}
      {confirmarVenta ? <PonerEnVentaSheet set={set} idioma={idiomaAlb || (set.rg === 'ja' ? 'JP' : '')} entradas={sinPublicar} onClose={() => setConfirmarVenta(false)} /> : null}
    </div>
  );
}
