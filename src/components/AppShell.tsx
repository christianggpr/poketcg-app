'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ordenesDe } from '@/lib/compras';
import { useCatalogoOpcional } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { useMercado } from './MercadoProvider';
import { usePerfil } from './PerfilProvider';
import { Aviso, Cargando } from './ui';
import { Icono } from './Icono';
import { liberarScrollSiNoHayHojas } from './Sheet';
import { AplicarTemaUsuario } from './Tema';
import { BarraInferiorCelular, BarraSuperior, BuscadorMercadoCelular, ChipsSecciones, type PestanaPrincipal, type Seccion } from './Barras';
import { ResumenColeccion } from './ResumenColeccion';
import { PorLlegar } from './vistas/PorLlegar';

/** Las dos pestañas principales y qué rutas pertenecen a cada una. */
const PRINCIPALES: PestanaPrincipal[] = [
  { id: 'coleccion', href: '/app/album', label: 'Mi Colección', ico: 'albumes', rutas: ['/app/album', '/app/bulk', '/app/cajas', '/app/mazos', '/app/buscar', '/app/escanear', '/app/carta', '/app/ventas'] },
  { id: 'mercado', href: '/app/mercado', label: 'Mercado', ico: 'tienda', rutas: ['/app/mercado', '/app/carrito', '/app/compras'] }
];
/** Secciones de cada pestaña: chips en el celular; en PC, menú lateral (Mi Colección) o chips (Mercado). */
const SECCIONES: Record<'coleccion' | 'mercado', Seccion[]> = {
  coleccion: [
    { href: '/app/album', label: 'Álbumes', ico: 'album', rutas: ['/app/album'], testid: 'sec-album' },
    { href: '/app/bulk', label: 'Bulk', ico: 'bulk', rutas: ['/app/bulk', '/app/cajas'], testid: 'sec-bulk' },
    // Mejoras 2 · D: Mazos pasa de Mercado a Mi Colección (mismas direcciones /app/mazos y /app/mazos/<id>)
    { href: '/app/mazos', label: 'Mazos', ico: 'mazos', rutas: ['/app/mazos'], testid: 'sec-mazos' },
    { href: '/app/buscar', label: 'Buscar / Escanear', labelCorto: 'Buscar', ico: 'buscar', rutas: ['/app/buscar', '/app/escanear', '/app/carta'], testid: 'sec-buscar' },
    { href: '/app/ventas', label: 'Mis ventas', ico: 'ventas', rutas: ['/app/ventas'], testid: 'sec-ventas' }
  ],
  mercado: [
    { href: '/app/mercado', label: 'Inicio', ico: 'inicio', rutas: ['/app/mercado'], testid: 'sec-inicio' },
    { href: '/app/carrito', label: 'Carrito', ico: 'carrito', rutas: ['/app/carrito'], testid: 'sec-carrito' },
    { href: '/app/compras', label: 'Mis compras', ico: 'compras', rutas: ['/app/compras'], testid: 'sec-compras' }
  ]
};
const pertenece = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(prefijo + '/');
/** Pantallas interiores (detalle de carta, álbum, Bulk, compra, mazo, orden, pago…): sin chips y con «volver» en el celular. */
const esInterior = (ruta: string) => /^\/app\/(carta|album|compras|mazos|ventas\/ordenes)\/.+/.test(ruta) || ruta === '/app/notificaciones' || ruta === '/app/ajustes' || ruta === '/app/tienda';
/** En PC, Mi Colección lleva menú lateral en Álbumes, Bulk (ajustes de layout · 6), Mazos, Buscar/Escanear y Mis ventas (no en los detalles de carta/álbum). */
const conLateral = (ruta: string) => ['/app/album', '/app/bulk', '/app/cajas', '/app/mazos', '/app/buscar', '/app/escanear', '/app/ventas', '/app/ventas/ordenes'].includes(ruta) || ruta.startsWith('/app/bulk/');

export function AppShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const { cat, estado, error } = useCatalogoOpcional();
  const col = useColeccion();
  const { perfil } = usePerfil();
  // Ajustes de layout · 7: la ficha de una carta marca la pestaña desde la que se llegó (?desde=mercado o la última
  // pestaña visitada); desde un álbum o Bulk, Mi Colección; desde el Mercado, el carrito o un carrusel, Mercado.
  const origen = useRef<'coleccion' | 'mercado'>('coleccion');
  const esCarta = /^\/app\/carta\//.test(ruta);
  const porRuta = PRINCIPALES.find(p => p.rutas.some(r => pertenece(ruta, r))) || (ruta === '/app' ? PRINCIPALES[0] : null);
  if (!esCarta && porRuta) origen.current = porRuta.id;
  const desde = params.get('desde');
  const principal = esCarta ? PRINCIPALES.find(p => p.id === (desde === 'mercado' || desde === 'coleccion' ? desde : origen.current)) || porRuta : porRuta;
  // sección activa: la de prefijo más largo que coincida (así /app/mercado/buscar no activa otra sección)
  const secciones = principal ? SECCIONES[principal.id] : [];
  const seccionActiva = secciones.map(s => ({ s, largo: Math.max(0, ...s.rutas.filter(r => pertenece(ruta, r)).map(r => r.length)) })).filter(x => x.largo > 0).sort((a, b) => b.largo - a.largo)[0]?.s || null;
  const interior = esInterior(ruta);
  const lateral = principal?.id === 'coleccion' && conLateral(ruta);
  const inicioColeccion = ruta === '/app/album';
  const inicioMercado = ruta === '/app/mercado';
  const listo = !!cat && col.cargado;
  // Mejoras 1 · A1: al cambiar de página, si no quedó ninguna hoja abierta, el desplazamiento se libera siempre
  useEffect(() => { const t = setTimeout(liberarScrollSiNoHayHojas, 50); return () => clearTimeout(t); }, [ruta]);
  return (
    <div id="app" className={lateral ? 'con-lateral' : ''} data-pestana={principal?.id || ''}>
      <AplicarTemaUsuario />
      <BarraSuperior principales={PRINCIPALES} principal={principal} interior={interior} />
      <main id="main">
        <div className={`view ${lateral ? 'view-lateral' : ''}`}>
          <Suspense><AvisosDeEntrada /></Suspense>
          {perfil.estado === 'suspendido' ? <Aviso tipo="danger"><b>Tu cuenta está suspendida</b>{perfil.suspendido_motivo ? `: ${perfil.suspendido_motivo}` : ''}. Puedes seguir usando tu colección, pero no comprar ni vender hasta que el administrador la reactive. Si crees que es un error, escríbenos.</Aviso> : null}
          {error ? <Aviso tipo="danger">No se pudo cargar el catálogo de cartas: {error}. Revisa tu conexión y recarga la página.</Aviso> : null}
          {col.error ? <Aviso tipo="danger">Problema al guardar o leer tu colección: {col.error}</Aviso> : null}
          {lateral && listo ? (
            <aside className="lateral" data-testid="menu-lateral">
              <ResumenColeccion />
              <nav className="lateral-menu" aria-label="Mi Colección">
                {secciones.map(s => <Link key={s.href} href={s.href} className={seccionActiva?.href === s.href ? 'active' : ''} aria-current={seccionActiva?.href === s.href ? 'page' : undefined} data-testid={`lateral-${s.testid}`}>{s.label}{s.href === '/app/ventas' ? <PorEntregar /> : null}</Link>)}
              </nav>
              <PorLlegar compacto />
            </aside>
          ) : null}
          <div className="contenido">
            {principal && inicioColeccion && listo ? <><h1 className="titulo-pestana solo-celular">Mi Colección</h1><ResumenColeccion className="solo-celular" /></> : null}
            {principal && inicioMercado ? <><h1 className="titulo-pestana solo-celular">Mercado</h1><BuscadorMercadoCelular /></> : null}
            {secciones.length && !interior ? <ChipsSecciones secciones={secciones} activa={seccionActiva} label={principal?.label} className={principal?.id === 'coleccion' ? 'solo-celular' : ''} /> : null}
            {!cat && !error ? <Cargando texto={estado || 'Cargando…'} /> : null}
            {cat && !col.cargado && !col.error ? <Cargando texto="Cargando tu colección…" /> : null}
            {listo ? children : null}
          </div>
        </div>
      </main>
      <BarraInferiorCelular principales={PRINCIPALES} principal={principal} />
    </div>
  );
}

/** Contador de órdenes de venta por entregar (insignia del menú lateral «Mis ventas»). */
function PorEntregar() {
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const [n, setN] = useState(0);
  useEffect(() => { ordenesDe('vendedor_id', perfil.id).then(d => setN(d.ordenes.filter(o => o.estado === 'pago_confirmado').length)).catch(() => setN(0)); }, [perfil.id, mercado.version]);
  return n ? <span className="pill warn insignia-menu" data-testid="por-entregar">{n}</span> : null;
}

/** Avisos que llegan por la dirección (?bienvenida=1 al confirmar el correo, ?clave=ok al cambiar la contraseña). */
function AvisosDeEntrada() {
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const { perfil } = usePerfil();
  const [bienvenida, setBienvenida] = useState(false);
  const [claveOk, setClaveOk] = useState(false);
  useEffect(() => {
    if (params.get('bienvenida') === '1') setBienvenida(true);
    if (params.get('clave') === 'ok') setClaveOk(true);
    if (params.get('bienvenida') || params.get('clave')) router.replace(ruta);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  if (!bienvenida && !claveOk) return null;
  return (
    <>
      {bienvenida ? <Aviso tipo="ok"><Icono n="fiesta" tam={16} /> ¡Tu correo quedó confirmado! Bienvenido/a, {perfil.nombres.split(' ')[0] || perfil.username}. Empieza por tus álbumes o crea un Bulk y añade tus primeras cartas desde Buscar. <button className="link" onClick={() => setBienvenida(false)}>Cerrar</button></Aviso> : null}
      {claveOk ? <Aviso tipo="ok">Contraseña cambiada. <button className="link" onClick={() => setClaveOk(false)}>Cerrar</button></Aviso> : null}
    </>
  );
}
