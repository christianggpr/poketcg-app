import Link from 'next/link';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';

/** Barra superior de las páginas públicas (ficha de carta, tiendas, ayuda): marca + ingresar/crear cuenta o volver a la app. */
export function BarraPublica({ conSesion, volver = '/' }: { conSesion: boolean; volver?: string }) {
  return (
    <header className="topbar">
      <Link href={conSesion ? '/app' : '/'} className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-icon" src="/icons/icon.svg" alt="" />
        <div><div className="brand-name">{APP_NAME}</div><div className="brand-sub">{APP_TAGLINE}</div></div>
      </Link>
      <div className="topbar-right">
        {conSesion ? <Link className="btn sm primary" href="/app/album">Abrir la app</Link> : <><Link className="btn sm" href={'/ingresar' + (volver !== '/' ? '?volver=' + encodeURIComponent(volver) : '')}>Ingresar</Link><Link className="btn sm primary" href="/registro">Crear cuenta</Link></>}
      </div>
    </header>
  );
}

/** Pie común de las páginas públicas. */
export function PiePublico() {
  return (
    <footer className="small muted" style={{ textAlign: 'center', padding: '12px 16px 32px' }}>
      <Link href="/ayuda">Ayuda</Link> · <Link href="/tiendas">Tiendas</Link> · <Link href="/instalar">App Android</Link> · <Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link>
      <div style={{ marginTop: 4 }}>Proyecto sin afiliación con Nintendo, Creatures, GAME FREAK ni The Pokémon Company.</div>
    </footer>
  );
}
