import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/supabase/server';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';
import { appAndroid } from '@/lib/descargas';
import { InstalarApp } from '@/components/portada/InstalarApp';

export default async function Portada() {
  const user = await usuarioActual();
  if (user) redirect('/app');
  const apk = appAndroid();
  return (
    <div id="app">
      <header className="topbar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-icon" src="/icons/icon.svg" alt="" />
          <div><div className="brand-name">{APP_NAME}</div><div className="brand-sub">{APP_TAGLINE}</div></div>
        </div>
        <div className="topbar-right">
          <Link className="btn sm" href="/ingresar">Ingresar</Link>
          <Link className="btn sm primary" href="/registro">Crear cuenta</Link>
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <h1>Todas tus cartas Pokémon TCG, registradas y ubicadas al instante.</h1>
          <p className="lead">Registra tu colección, organízala en cajas y álbumes, y encuentra cualquier carta en segundos: la app te dice en qué caja y en qué posición está, desde cualquier dispositivo.</p>
          <div className="cta">
            <Link className="btn primary" href="/registro">Crear mi cuenta gratis</Link>
            <Link className="btn" href="/ingresar">Ya tengo cuenta</Link>
            {apk ? <a className="btn" href={apk.url} download="poketcg.apk" data-testid="btn-apk-cta">🤖 App para Android (.apk)</a> : null}
          </div>
          <InstalarApp apk={apk} />
          <div className="features">
            <div className="feature"><div className="ico">📦</div><b>Cajas con posición exacta</b><span>Cada carta con su caja y su número de posición; la app calcula sola dónde va la siguiente.</span></div>
            <div className="feature"><div className="ico">📒</div><b>Álbumes por colección e idioma</b><span>Ve lo que tienes y lo que te falta de cada colección, y arma tus álbumes físicos página por página.</span></div>
            <div className="feature"><div className="ico">🔍</div><b>Búsqueda en cualquier idioma</b><span>Catálogo de más de 34 000 cartas internacionales y japonesas con nombres en español, inglés y japonés.</span></div>
            <div className="feature"><div className="ico">💵</div><b>Valor de tu colección</b><span>Precio de mercado por acabado (normal, reverse, holo) y valor total de lo que tienes.</span></div>
            <div className="feature"><div className="ico">🛒</div><b>Mercado entre coleccionistas</b><span>Vende desde tus cajas y compra con pago por Yape/Plin, entrega en tienda y código de retiro. Sin cargos al comprador; el vendedor cobra cada día.</span></div>
            <div className="feature"><div className="ico">🃏</div><b>Mazos meta</b><span>Los mazos del formato actual con el porcentaje que ya tienes y «comprar lo que me falta».</span></div>
          </div>
        </section>
      </main>
      <footer className="small muted" style={{ textAlign: 'center', padding: '12px 16px 32px' }}>
        <Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link> · Proyecto sin afiliación con Nintendo, Creatures, GAME FREAK ni The Pokémon Company.
      </footer>
    </div>
  );
}
