'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME } from '@/lib/config';
import { useCatalogoOpcional } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';
import { totalCartas } from '@/lib/coleccion';
import { Aviso, Cargando } from './ui';

const TABS: { href: string; label: string; ico: string; soon?: boolean }[] = [
  { href: '/app', label: 'Buscar', ico: '🔍' },
  { href: '/app/escanear', label: 'Escanear', ico: '📷' },
  { href: '/app/album', label: 'Álbum', ico: '📒' },
  { href: '/app/cajas', label: 'Cajas', ico: '📦' },
  { href: '/app/ajustes', label: 'Ajustes', ico: '⚙️' }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { cat, estado, error } = useCatalogoOpcional();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const activo = (href: string) => (href === '/app' ? ruta === '/app' || ruta.startsWith('/app/carta') : href === '/app/cajas' ? ruta.startsWith(href) || ruta.startsWith('/app/ventas') : ruta.startsWith(href));
  const sub = col.cargado ? `${totalCartas(col.entradas).toLocaleString('es-PE')} cartas · ${col.cajas.length} ${col.cajas.length === 1 ? 'caja' : 'cajas'}` : perfil.username;
  return (
    <div id="app">
      <header className="topbar">
        <Link href="/app" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-icon" src="/icons/icon.svg" alt="" />
          <div><div className="brand-name">{APP_NAME}</div><div className="brand-sub">{sub}</div></div>
        </Link>
        <nav className="tabs">
          {TABS.map(t => <Link key={t.href} href={t.href} className={`${activo(t.href) ? 'active' : ''} ${t.soon ? 'soon' : ''}`}>{t.ico} {t.label}</Link>)}
        </nav>
        <div className="topbar-right">
          {perfil.rol === 'admin' ? <Link className="chip" href="/admin">Admin</Link> : null}
          <span className="chip" title={perfil.email}>@{perfil.username}</span>
        </div>
      </header>
      <main id="main">
        <div className="view">
          {error ? <Aviso tipo="danger">No se pudo cargar el catálogo de cartas: {error}. Revisa tu conexión y recarga la página.</Aviso> : null}
          {col.error ? <Aviso tipo="danger">Problema al guardar o leer tu colección: {col.error}</Aviso> : null}
          {!cat && !error ? <Cargando texto={estado || 'Cargando…'} /> : null}
          {cat && !col.cargado && !col.error ? <Cargando texto="Cargando tu colección…" /> : null}
          {cat && col.cargado ? children : null}
        </div>
      </main>
      <nav className="tabbar">
        {TABS.map(t => <Link key={t.href} href={t.href} className={`${activo(t.href) ? 'active' : ''} ${t.soon ? 'soon' : ''}`}><span className="ico">{t.ico}</span>{t.label}</Link>)}
      </nav>
    </div>
  );
}
