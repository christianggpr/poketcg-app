import { Icono } from '@/components/Icono';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/lib/supabase/server';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';
import { appAndroid } from '@/lib/descargas';
import { fmtPen } from '@/lib/precios-core';
import { datosLegales } from '@/lib/legal';
import { cartasPublicas, estadisticasPublicas, supabasePublico } from '@/lib/publico';
import { InstalarApp } from '@/components/portada/InstalarApp';
import { PiePublico } from '@/components/portada/BarraPublica';

export const dynamic = 'force-dynamic';

const haceCuanto = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 36e5; return h < 1 ? 'hace minutos' : h < 24 ? `hace ${Math.floor(h)} h` : `hace ${Math.floor(h / 24)} d`; };

export default async function Portada() {
  const user = await usuarioActual();
  if (user) redirect('/app');
  const apk = appAndroid();
  const sb = supabasePublico();
  const [stats, legal] = await Promise.all([estadisticasPublicas(sb).catch(() => null), datosLegales()]);
  const ids = stats ? [...stats.ultimas_ventas.map(v => v.carta_id), ...stats.recientes.map(r => r.carta_id), ...stats.mas_vendidas.map(m => m.carta_id)] : [];
  const nombres = ids.length ? await cartasPublicas(sb, ids) : new Map();
  const nombre = (id: string) => { const c = nombres.get(id); return c ? `${c.nombre} ${c.numero}${c.total}` : id; };
  const hayMovimiento = !!stats && (stats.ultimas_ventas.length > 0 || stats.recientes.length > 0);
  return (
    <div id="app">
      <header className="topbar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-icon" src="/icons/icon.svg" alt="" />
          <div><div className="brand-name">{APP_NAME}</div><div className="brand-sub">{APP_TAGLINE}</div></div>
        </div>
        <div className="topbar-right">
          <Link className="btn sm ghost" href="/ayuda">Ayuda</Link>
          <Link className="btn sm" href="/ingresar">Ingresar</Link>
          <Link className="btn sm primary" href="/registro">Crear cuenta</Link>
        </div>
      </header>
      <main id="main">
        <section className="hero">
          <h1>Todas tus cartas Pokémon TCG, registradas y ubicadas al instante.</h1>
          <p className="lead">Registra tu colección, organízala en álbumes y Bulks, y encuentra cualquier carta en segundos: la app te dice en qué álbum o Bulk y en qué posición está, desde cualquier dispositivo. Y cuando quieras, vende tus repetidas o compra las que te faltan a otros coleccionistas, con entrega segura en tienda.</p>
          <div className="cta">
            <Link className="btn primary" href="/registro">Crear mi cuenta gratis</Link>
            <Link className="btn" href="/ingresar">Ya tengo cuenta</Link>
            {apk ? <a className="btn" href={apk.url} download="poketcg.apk" data-testid="btn-apk-cta"><Icono n="robot" /> App para Android (.apk)</a> : null}
          </div>
          <InstalarApp apk={apk} />

          {stats ? (
            <div className="cifras" data-testid="cifras-comunidad">
              <div className="box"><b>{stats.usuarios.toLocaleString('es-PE')}</b><span>coleccionistas</span></div>
              <div className="box"><b>{stats.cartas_registradas.toLocaleString('es-PE')}</b><span>cartas registradas</span></div>
              <div className="box"><b>{stats.en_venta.toLocaleString('es-PE')}</b><span>copias en venta</span></div>
              <div className="box"><b>{stats.vendidas.toLocaleString('es-PE')}</b><span>cartas vendidas</span></div>
              <div className="box"><b>{stats.tiendas}</b><span>{stats.tiendas === 1 ? 'tienda de entrega' : 'tiendas de entrega'} · <Link href="/tiendas">ver</Link></span></div>
            </div>
          ) : null}

          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>Cómo funciona el mercado</h2>
            <p className="small muted" style={{ margin: 0 }}>Comisión del {legal.comisionPct} % que paga el vendedor. El comprador paga el precio publicado, nada más.</p>
            <div className="como-funciona" data-testid="como-funciona">
              <div className="paso"><div className="n">1</div><b>Elige y paga</b><span>Agrega cartas al carrito, elige la tienda donde las recogerás y paga por {legal.pagos.metodos.join(' o ') || 'Yape o Plin'}.</span></div>
              <div className="paso"><div className="n">2</div><b>El vendedor entrega</b><span>Deja las cartas en la tienda antes de la fecha límite. Si no cumple, recuperas tu dinero con un toque.</span></div>
              <div className="paso"><div className="n">3</div><b>Recoge con tu código</b><span>Muestra tu código de retiro, revisa las cartas en la tienda y listo: entran solas a tu colección.</span></div>
            </div>
          </div>

          {hayMovimiento ? (
            <div className="novedades" data-testid="novedades">
              {stats!.recientes.length ? <div className="lista"><h3>Recién publicadas</h3>{stats!.recientes.map(r => <Link key={r.id} href={`/carta/${encodeURIComponent(r.carta_id)}`}><span>{nombre(r.carta_id)} <span className="muted small">{r.condicion || ''} {r.idioma} · @{r.vendedor}</span></span><b>{fmtPen(r.precio_pen)}</b></Link>)}</div> : null}
              {stats!.ultimas_ventas.length ? <div className="lista"><h3>Últimas ventas</h3>{stats!.ultimas_ventas.map((v, i) => <Link key={i} href={`/carta/${encodeURIComponent(v.carta_id)}`}><span>{nombre(v.carta_id)} <span className="muted small">{v.condicion || ''} {v.idioma} · {haceCuanto(v.entregada_en)}</span></span><b>{fmtPen(v.precio_pen)}</b></Link>)}</div> : null}
              {stats!.mas_vendidas.length ? <div className="lista"><h3>Las más vendidas (90 días)</h3>{stats!.mas_vendidas.map(m => <Link key={m.carta_id} href={`/carta/${encodeURIComponent(m.carta_id)}`}><span>{nombre(m.carta_id)} <span className="muted small">{m.unidades} {m.unidades === 1 ? 'vendida' : 'vendidas'}</span></span><b>desde {fmtPen(m.desde)}</b></Link>)}</div> : null}
            </div>
          ) : null}

          <div className="features">
            <div className="feature"><div className="ico"><Icono n="bulk" tam={28} grosor={2} /></div><b>Álbumes y Bulk con posición exacta</b><span>Cada carta con su álbum (casilla) o su Bulk y número de posición; la app sugiere sola dónde va la siguiente.</span></div>
            <div className="feature"><div className="ico"><Icono n="album" tam={28} grosor={2} /></div><b>Álbumes por colección e idioma</b><span>Ve lo que tienes y lo que te falta de cada colección, y arma tus álbumes físicos página por página.</span></div>
            <div className="feature"><div className="ico"><Icono n="buscar" tam={28} grosor={2} /></div><b>Búsqueda en cualquier idioma</b><span>Catálogo de más de 34 000 cartas internacionales y japonesas con nombres en español, inglés y japonés.</span></div>
            <div className="feature"><div className="ico"><Icono n="billete" tam={28} grosor={2} /></div><b>Precio de tu colección</b><span>Precio de mercado por acabado (normal, reverse, holo) y precio total de lo que tienes.</span></div>
            <div className="feature"><div className="ico"><Icono n="carrito" tam={28} grosor={2} /></div><b>Mercado entre coleccionistas</b><span>Vende desde tu colección y compra con pago por Yape/Plin, entrega en tienda y código de retiro. Sin cargos al comprador; el vendedor cobra cada día.</span></div>
            <div className="feature"><div className="ico"><Icono n="estrella" tam={28} grosor={2} /></div><b>Vendedores con reputación</b><span>Reseñas, insignias y perfil público de cada vendedor. Si no entrega, anulas con un toque y recuperas tu dinero al instante.</span></div>
            <div className="feature"><div className="ico"><Icono n="mazos" tam={28} grosor={2} /></div><b>Mazos meta</b><span>Los mazos del formato actual con el porcentaje que ya tienes y «comprar lo que me falta».</span></div>
            <div className="feature"><div className="ico"><Icono n="corazon" tam={28} grosor={2} /></div><b>Lista de deseos</b><span>Marca las cartas que buscas y te avisamos cuando alguien las publique.</span></div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>¿Dudas? Lee el <Link href="/ayuda">centro de ayuda</Link>{legal.pagos.whatsapp ? <> o escríbenos por WhatsApp al <a href={`https://wa.me/51${legal.pagos.whatsapp}`} target="_blank" rel="noreferrer">{legal.pagos.whatsapp}</a> ({legal.pagos.atencion})</> : null}.</p>
        </section>
      </main>
      <PiePublico />
    </div>
  );
}
