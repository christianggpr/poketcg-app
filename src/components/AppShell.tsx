'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { APP_NAME } from '@/lib/config';
import { useCatalogoOpcional } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { useMercado } from './MercadoProvider';
import { useNotificaciones } from './NotificacionesProvider';
import { usePerfil } from './PerfilProvider';
import { totalCartas } from '@/lib/coleccion';
import { Aviso, Cargando } from './ui';
import { Icono, type NombreIcono } from './Icono';

/** Las dos pestañas principales (Mejoras 1 · B) y qué rutas pertenecen a cada una. */
const PRINCIPALES: { id: 'coleccion' | 'mercado'; href: string; label: string; ico: NombreIcono; rutas: string[] }[] = [
  { id: 'coleccion', href: '/app/album', label: 'Mi Colección', ico: 'albumes', rutas: ['/app/album', '/app/bulk', '/app/cajas', '/app/buscar', '/app/escanear', '/app/carta', '/app/ventas'] },
  { id: 'mercado', href: '/app/mercado', label: 'Mercado', ico: 'tienda', rutas: ['/app/mercado', '/app/mazos', '/app/carrito', '/app/compras'] }
];
/** Secciones internas de cada pestaña (chips arriba del contenido). */
const SECCIONES: Record<'coleccion' | 'mercado', { href: string; label: string; ico: NombreIcono; rutas: string[]; testid: string }[]> = {
  coleccion: [
    { href: '/app/album', label: 'Álbumes', ico: 'album', rutas: ['/app/album'], testid: 'sec-album' },
    { href: '/app/bulk', label: 'Bulk', ico: 'bulk', rutas: ['/app/bulk', '/app/cajas'], testid: 'sec-bulk' },
    { href: '/app/buscar', label: 'Buscar / Escanear', ico: 'buscar', rutas: ['/app/buscar', '/app/escanear', '/app/carta'], testid: 'sec-buscar' },
    { href: '/app/ventas', label: 'Mis ventas', ico: 'ventas', rutas: ['/app/ventas'], testid: 'sec-ventas' }
  ],
  mercado: [
    { href: '/app/mercado', label: 'Inicio', ico: 'inicio', rutas: ['/app/mercado'], testid: 'sec-inicio' },
    { href: '/app/mercado/buscar', label: 'Buscar en el mercado', ico: 'buscar', rutas: ['/app/mercado/buscar'], testid: 'sec-mercado-buscar' },
    { href: '/app/mazos', label: 'Mazos', ico: 'mazos', rutas: ['/app/mazos'], testid: 'sec-mazos' },
    { href: '/app/carrito', label: 'Carrito', ico: 'carrito', rutas: ['/app/carrito'], testid: 'sec-carrito' },
    { href: '/app/compras', label: 'Mis compras', ico: 'compras', rutas: ['/app/compras'], testid: 'sec-compras' }
  ]
};
const pertenece = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(prefijo + '/');

export function AppShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { cat, estado, error } = useCatalogoOpcional();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const notif = useNotificaciones();
  const principal = PRINCIPALES.find(p => p.rutas.some(r => pertenece(ruta, r))) || (ruta === '/app' ? PRINCIPALES[0] : null);
  // sección activa: la de prefijo más largo que coincida (así /app/mercado/buscar no activa "Inicio")
  const secciones = principal ? SECCIONES[principal.id] : [];
  const seccionActiva = secciones.map(s => ({ s, largo: Math.max(0, ...s.rutas.filter(r => pertenece(ruta, r)).map(r => r.length)) })).filter(x => x.largo > 0).sort((a, b) => b.largo - a.largo)[0]?.s || null;
  const sub = col.cargado ? `${totalCartas(col.entradas).toLocaleString('es-PE')} cartas · ${col.cajas.length} ${col.cajas.length === 1 ? 'bulk' : 'bulks'}` : perfil.username;
  return (
    <div id="app">
      <header className="topbar">
        <Link href="/app/album" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-icon" src="/icons/icon.svg" alt="" />
          <div><div className="brand-name">{APP_NAME}</div><div className="brand-sub">{sub}</div></div>
        </Link>
        <nav className="tabs" data-testid="tabs-principales">
          {PRINCIPALES.map(t => <Link key={t.id} href={t.href} className={principal?.id === t.id ? 'active' : ''} data-testid={`tab-${t.id}`}><Icono n={t.ico} /> {t.label}</Link>)}
        </nav>
        <div className="topbar-right">
          <Link className={`chip ${notif.noLeidas ? 'warn' : ''}`} href="/app/notificaciones" title="Notificaciones" aria-label={notif.noLeidas ? `${notif.noLeidas} notificaciones sin leer` : 'Notificaciones'} data-testid="chip-notificaciones"><Icono n="campana" tam={18} />{notif.noLeidas ? <span className="cuenta">{notif.noLeidas}</span> : null}</Link>
          <Link className="chip carrito" href="/app/carrito" title="Carrito" aria-label={`Carrito: ${mercado.unidades || 0}`} data-testid="chip-carrito"><Icono n="carrito" tam={20} />{mercado.unidades ? <span className="cuenta">{mercado.unidades}</span> : null}</Link>
          {perfil.rol === 'tienda' ? <Link className="chip" href="/app/tienda"><Icono n="tienda" tam={16} /> Tienda</Link> : null}
          {perfil.rol === 'admin' ? <Link className="chip" href="/admin">Admin</Link> : null}
          <MenuPerfil />
        </div>
      </header>
      <main id="main">
        <div className="view">
          <Suspense><AvisosDeEntrada /></Suspense>
          {perfil.estado === 'suspendido' ? <Aviso tipo="danger"><b>Tu cuenta está suspendida</b>{perfil.suspendido_motivo ? `: ${perfil.suspendido_motivo}` : ''}. Puedes seguir usando tu colección, pero no comprar ni vender hasta que el administrador la reactive. Si crees que es un error, escríbenos.</Aviso> : null}
          {error ? <Aviso tipo="danger">No se pudo cargar el catálogo de cartas: {error}. Revisa tu conexión y recarga la página.</Aviso> : null}
          {col.error ? <Aviso tipo="danger">Problema al guardar o leer tu colección: {col.error}</Aviso> : null}
          {secciones.length ? (
            <nav className="subtabs" aria-label={principal?.label} data-testid="subtabs">
              {secciones.map(s => <Link key={s.href} href={s.href} className={seccionActiva?.href === s.href ? 'active' : ''} data-testid={s.testid}><Icono n={s.ico} tam={16} /> {s.label}</Link>)}
            </nav>
          ) : null}
          {!cat && !error ? <Cargando texto={estado || 'Cargando…'} /> : null}
          {cat && !col.cargado && !col.error ? <Cargando texto="Cargando tu colección…" /> : null}
          {cat && col.cargado ? children : null}
        </div>
      </main>
      <nav className="tabbar" data-testid="tabbar">
        {PRINCIPALES.map(t => <Link key={t.id} href={t.href} className={principal?.id === t.id ? 'active' : ''} data-testid={`tabbar-${t.id}`}><Icono n={t.ico} tam={22} />{t.label}</Link>)}
      </nav>
    </div>
  );
}

/** Icono de perfil (arriba a la derecha): ajustes, ayuda, notificaciones y cerrar sesión. */
function MenuPerfil() {
  const { perfil } = usePerfil();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ruta = usePathname();
  useEffect(() => { setAbierto(false); }, [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera); document.addEventListener('touchstart', fuera); document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  const inicial = (perfil.nombres || perfil.username || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="menu-perfil" ref={ref}>
      <button className={`avatar ${abierto ? 'active' : ''}`} onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto} title={`@${perfil.username}`} data-testid="btn-perfil">{inicial}</button>
      {abierto ? (
        <div className="menu" role="menu" data-testid="menu-perfil">
          <div className="menu-cabecera"><b>@{perfil.username}</b><span className="small muted">{perfil.email}</span></div>
          <Link href="/app/ajustes" role="menuitem" data-testid="menu-ajustes"><Icono n="ajustes" /> Ajustes y perfil</Link>
          <Link href="/app/notificaciones" role="menuitem"><Icono n="campana" /> Notificaciones</Link>
          <Link href="/ayuda" role="menuitem" target="_blank"><Icono n="ayuda" /> Centro de ayuda</Link>
          {perfil.rol === 'tienda' ? <Link href="/app/tienda" role="menuitem"><Icono n="tienda" /> Tienda</Link> : null}
          {perfil.rol === 'admin' ? <Link href="/admin" role="menuitem"><Icono n="herramientas" /> Administración</Link> : null}
          <form action="/api/auth/salir" method="post"><button type="submit" role="menuitem" data-testid="menu-salir"><Icono n="salir" /> Cerrar sesión</button></form>
        </div>
      ) : null}
    </div>
  );
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
      {bienvenida ? <Aviso tipo="ok">¡Tu correo quedó confirmado! Bienvenido/a, {perfil.nombres.split(' ')[0] || perfil.username}. Empieza por tus álbumes o crea un Bulk y añade tus primeras cartas desde Buscar. <button className="link" onClick={() => setBienvenida(false)}>Cerrar</button></Aviso> : null}
      {claveOk ? <Aviso tipo="ok">Contraseña cambiada. <button className="link" onClick={() => setClaveOk(false)}>Cerrar</button></Aviso> : null}
    </>
  );
}
