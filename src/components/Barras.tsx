'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { APP_NAME } from '@/lib/config';
import { Icono, type NombreIcono } from './Icono';
import { useMercado } from './MercadoProvider';
import { useNotificaciones } from './NotificacionesProvider';
import { usePerfil } from './PerfilProvider';

export type Principal = 'coleccion' | 'mercado';
export type PestanaPrincipal = { id: Principal; href: string; label: string; ico: NombreIcono; rutas: string[] };
export type Seccion = { href: string; label: string; labelCorto?: string; ico: NombreIcono; rutas: string[]; testid: string; /** insignia (p. ej. órdenes por entregar en «Mis ventas») */ insignia?: React.ReactNode };

/** Iniciales del usuario para el avatar ("CP"). */
export function iniciales(nombres: string, apellidos: string, username: string): string {
  const a = (nombres || '').trim().charAt(0), b = (apellidos || '').trim().charAt(0);
  return ((a + b) || (username || '?').slice(0, 2)).toUpperCase();
}

/** Botón «Volver»: a la página anterior si la hay, si no a la pantalla de inicio de la pestaña. */
export function BotonVolver({ a, label = 'Volver', className = '' }: { a: string; label?: string; className?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={`btn icon volver ${className}`} aria-label={label} title={label} data-testid="btn-volver"
      onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push(a); }}>
      <Icono n="izquierda" tam={22} />
    </button>
  );
}

/**
 * Barra superior. Celular: logo + nombre (o «volver» + nombre de la pestaña en pantallas interiores), carrito amarillo y avatar.
 * PC (≥ 1024 px): logo, las dos pestañas en una cápsula crema, buscador ancho, carrito y avatar.
 */
export function BarraSuperior({ principales, principal, interior }: { principales: PestanaPrincipal[]; principal: PestanaPrincipal | null; interior: boolean }) {
  const mercado = useMercado();
  const notif = useNotificaciones();
  const { perfil } = usePerfil();
  return (
    <header className="topbar" data-testid="barra-superior">
      {interior ? (
        <div className="brand solo-celular" data-testid="volver-celular">
          <BotonVolver a={principal?.href || '/app/album'} label={`Volver a ${principal?.label || APP_NAME}`} />
          <div className="brand-name">{principal?.label || APP_NAME}</div>
        </div>
      ) : null}
      <Link href="/app/album" className={`brand ${interior ? 'solo-pc' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }} aria-label={APP_NAME}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-icon" src="/icons/icon.svg" alt="" />
        <div className="brand-name">{APP_NAME}</div>
      </Link>
      <nav className="tabs" data-testid="tabs-principales" aria-label="Secciones principales">
        {principales.map(t => <Link key={t.id} href={t.href} className={principal?.id === t.id ? 'active' : ''} aria-current={principal?.id === t.id ? 'page' : undefined} data-testid={`tab-${t.id}`}><Icono n={t.ico} /> {t.label}</Link>)}
      </nav>
      <BuscadorPC principal={principal?.id || 'coleccion'} />
      <div className="topbar-right">
        {notif.noLeidas ? <Link className="chip warn" href="/app/notificaciones" title="Notificaciones" aria-label={`${notif.noLeidas} notificaciones sin leer`} data-testid="chip-notificaciones"><Icono n="campana" tam={18} /><span className="cuenta">{notif.noLeidas}</span></Link> : null}
        <Link className="chip carrito" href="/app/carrito" title="Carrito" aria-label={`Carrito: ${mercado.unidades || 0}`} data-testid="chip-carrito"><Icono n="carrito" tam={20} />{mercado.unidades ? <span className="cuenta">{mercado.unidades}</span> : null}</Link>
        {perfil.rol === 'tienda' ? <Link className="chip solo-pc" href="/app/tienda"><Icono n="tienda" tam={16} /> Tienda</Link> : null}
        {perfil.rol === 'admin' ? <Link className="chip solo-pc" href="/admin">Admin</Link> : null}
        <MenuPerfil />
      </div>
    </header>
  );
}

/**
 * Buscador ancho de la barra superior (solo PC): busca en mi colección o en el mercado según la pestaña.
 * Ajustes de layout 2 · 1: lleva dentro el botón de cámara (buscar por foto: abre el escáner).
 */
function BuscadorPC({ principal }: { principal: Principal }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ruta = usePathname();
  useEffect(() => { setQ(''); }, [ruta]);
  const destino = principal === 'mercado' ? '/app/mercado/buscar' : '/app/buscar';
  function buscar(e: FormEvent) {
    e.preventDefault();
    const t = q.trim();
    router.push(t ? `${destino}?q=${encodeURIComponent(t)}` : destino);
  }
  return (
    <form className="buscador-pc" role="search" onSubmit={buscar} data-testid="buscador-pc">
      <span className="ico"><Icono n="buscar" tam={20} /></span>
      <input className="input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={principal === 'mercado' ? 'Buscar en el mercado' : 'Buscar en mi colección'} aria-label={principal === 'mercado' ? 'Buscar en el mercado' : 'Buscar en mi colección'} />
      <BotonCamara />
    </form>
  );
}

/** Botón de cámara de los buscadores: abre el escáner (identificar una carta por foto). */
function BotonCamara() {
  return <Link href="/app/escanear" className="btn icon suave foto" aria-label="Buscar por foto (escáner)" title="Buscar por foto: abre el escáner" data-testid="btn-camara"><Icono n="camara" tam={20} /></Link>;
}

/** Barra inferior del celular: dos pestañas grandes (Mi Colección / Mercado). */
export function BarraInferiorCelular({ principales, principal }: { principales: PestanaPrincipal[]; principal: PestanaPrincipal | null }) {
  return (
    <nav className="tabbar" data-testid="tabbar" aria-label="Secciones principales">
      {principales.map(t => <Link key={t.id} href={t.href} className={principal?.id === t.id ? 'active' : ''} aria-current={principal?.id === t.id ? 'page' : undefined} data-testid={`tabbar-${t.id}`}><Icono n={t.ico} tam={22} />{t.label}</Link>)}
    </nav>
  );
}

/** Chips de secciones (Álbumes · Bulk · Mazos / Inicio · Mis compras · Mis ventas). */
export function ChipsSecciones({ secciones, activa, label, className = '' }: { secciones: Seccion[]; activa: Seccion | null; label?: string; className?: string }) {
  return (
    <nav className={`subtabs ${className}`} aria-label={label} data-testid="subtabs">
      {secciones.map(s => <Link key={s.href} href={s.href} className={activa?.href === s.href ? 'active' : ''} aria-current={activa?.href === s.href ? 'page' : undefined} data-testid={s.testid}><Icono n={s.ico} tam={16} /> {s.labelCorto || s.label}{s.insignia}</Link>)}
    </nav>
  );
}

/** Avatar con iniciales (arriba a la derecha): ajustes, notificaciones, ayuda, tienda/admin y cerrar sesión. */
export function MenuPerfil() {
  const { perfil } = usePerfil();
  const notif = useNotificaciones();
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
  return (
    <div className="menu-perfil" ref={ref}>
      <button className={`avatar ${abierto ? 'active' : ''}`} onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Menú de @${perfil.username}`} title={`@${perfil.username}`} data-testid="btn-perfil">{iniciales(perfil.nombres, perfil.apellidos, perfil.username)}</button>
      {abierto ? (
        <div className="menu" role="menu" data-testid="menu-perfil">
          <div className="menu-cabecera"><b>@{perfil.username}</b><span className="small muted">{perfil.email}</span></div>
          <Link href="/app/ajustes" role="menuitem" data-testid="menu-ajustes"><Icono n="ajustes" /> Ajustes y perfil</Link>
          <Link href="/app/notificaciones" role="menuitem"><Icono n="campana" /> Notificaciones{notif.noLeidas ? <span className="pill info" style={{ marginLeft: 'auto' }}>{notif.noLeidas}</span> : null}</Link>
          <Link href="/ayuda" role="menuitem" target="_blank"><Icono n="ayuda" /> Centro de ayuda</Link>
          {perfil.rol === 'tienda' ? <Link href="/app/tienda" role="menuitem"><Icono n="tienda" /> Tienda</Link> : null}
          {perfil.rol === 'admin' ? <Link href="/admin" role="menuitem"><Icono n="herramientas" /> Administración</Link> : null}
          <form action="/api/auth/salir" method="post"><button type="submit" role="menuitem" data-testid="menu-salir"><Icono n="salir" /> Cerrar sesión</button></form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Buscador grande del inicio de cada pestaña en el celular, con botón de buscar por foto (abre el escáner):
 * en el Mercado busca en el mercado; en Mi Colección (ajustes de layout 2 · 1) busca en mi colección y el catálogo.
 */
export function BuscadorCelular({ principal }: { principal: Principal }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const destino = principal === 'mercado' ? '/app/mercado/buscar' : '/app/buscar';
  return (
    <form className="buscador-mercado solo-celular" role="search" onSubmit={e => { e.preventDefault(); router.push(`${destino}${q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''}`); }} data-testid={`buscador-celular-${principal}`}>
      <span className="ico"><Icono n="buscar" tam={20} /></span>
      <input className="input" placeholder={principal === 'mercado' ? 'Busca una carta, colección o número' : 'Busca una carta en tu colección'} aria-label={principal === 'mercado' ? 'Buscar en el mercado' : 'Buscar en mi colección'} value={q} onChange={e => setQ(e.target.value)} data-testid={principal === 'mercado' ? 'mercado-inicio-buscar' : 'coleccion-inicio-buscar'} />
      <BotonCamara />
    </form>
  );
}
