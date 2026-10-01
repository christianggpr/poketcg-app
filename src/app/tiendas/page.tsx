import { Icono } from '@/components/Icono';
import Link from 'next/link';
import { ADMIN_EMAIL, APP_NAME } from '@/lib/config';
import { fmtPen } from '@/lib/precios-core';
import { enlaceMapa, supabasePublico, tiendasPublicas, type TiendaPub } from '@/lib/publico';
import { usuarioActual } from '@/lib/supabase/server';
import { BarraPublica, PiePublico } from '@/components/portada/BarraPublica';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tiendas de entrega en Lima', description: `Puntos de entrega aliados de ${APP_NAME}: dónde recoges las cartas que compras, horarios, distritos y cómo llegar.` };

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const hoyLima = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay();

function MapaOsm({ t }: { t: TiendaPub }) {
  if (t.lat == null || t.lon == null) return null;
  const d = 0.004;
  const bbox = `${t.lon - d},${t.lat - d},${t.lon + d},${t.lat + d}`;
  return <iframe className="mapa" loading="lazy" title={`Mapa: ${t.nombre}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${t.lat},${t.lon}`} />;
}

/** Tiendas aliadas (puntos de entrega) visibles sin cuenta, agrupadas por distrito, con mapa y cómo llegar. */
export default async function Tiendas() {
  const [tiendas, user] = await Promise.all([tiendasPublicas(supabasePublico()), usuarioActual()]);
  const hoy = hoyLima();
  const porDistrito = new Map<string, TiendaPub[]>();
  for (const t of tiendas) { const k = t.distrito || 'Otros'; porDistrito.set(k, [...(porDistrito.get(k) || []), t]); }
  return (
    <div id="app">
      <BarraPublica conSesion={!!user} volver="/tiendas" />
      <main id="main">
        <div className="legal" data-testid="tiendas-publicas" style={{ paddingTop: 8 }}>
          <p className="small"><Link href={user ? '/app' : '/'}>← {user ? 'La app' : APP_NAME}</Link></p>
          <h1>Tiendas de entrega</h1>
          <p className="lead" style={{ fontSize: 16 }}>En {APP_NAME} no hay envíos: el vendedor deja tus cartas en la tienda aliada que elijas al comprar y tú las recoges mostrando tu <b>código de retiro de 6 dígitos</b>. Revísalas ahí mismo antes de llevártelas.</p>
          {!tiendas.length ? <p className="notice warn">Todavía no hay tiendas activas. Escríbenos a {ADMIN_EMAIL}.</p> : null}
          <p className="small muted">{tiendas.length} {tiendas.length === 1 ? 'tienda aliada' : 'tiendas aliadas'} en {porDistrito.size} {porDistrito.size === 1 ? 'distrito' : 'distritos'}. Hoy es {DIAS[hoy].toLowerCase()}.</p>
          {[...porDistrito.entries()].map(([distrito, lista]) => (
            <section key={distrito} style={{ marginTop: 14 }}>
              <h2 style={{ marginBottom: 6 }}><Icono n="lugar" tam={20} /> {distrito}</h2>
              <div className="stack">
                {lista.map(t => { const abre = t.dias_abierto.includes(hoy); return (
                  <article key={t.id} className="panel" data-testid="tienda-publica">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{t.nombre}</h3>
                        <div className="small">{t.direccion}{t.referencia ? <span className="muted"> · {t.referencia}</span> : null}</div>
                      </div>
                      <span className={`pill ${abre ? 'ok' : 'warn'}`}>{abre ? 'abre hoy' : 'hoy cerrada'}</span>
                    </div>
                    <div className="small" style={{ marginTop: 6 }}><Icono n="reloj" tam={14} /> {t.horario || 'Horario no indicado'} · abre: {t.dias_abierto.map(d => DIAS[d]).join(' ')}</div>
                    <div className="small" style={{ marginTop: 4 }}>{t.tarifa_recojo > 0 ? <><Icono n="billete" tam={14} /> La tienda cobra <b>{fmtPen(t.tarifa_recojo)}</b> por recojo (se paga en la tienda).</> : <><Icono n="billete" tam={14} /> <b>Recojo gratis</b>: la tienda no cobra por entregar tus cartas.</>}</div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      <a className="btn sm primary" href={enlaceMapa(t)} target="_blank" rel="noreferrer"><Icono n="mapa" /> Cómo llegar</a>
                      {t.telefono ? <a className="btn sm" href={`tel:${t.telefono}`}><Icono n="telefono" /> {t.telefono}</a> : null}
                      {t.instagram ? <a className="btn sm" href={`https://instagram.com/${t.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer"><Icono n="camara" /> @{t.instagram.replace(/^@/, '')}</a> : null}
                    </div>
                    <MapaOsm t={t} />
                  </article>
                ); })}
              </div>
            </section>
          ))}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>¿Tienes una tienda de cartas?</h3>
            <p className="small" style={{ margin: 0 }}>Conviértela en punto de entrega de {APP_NAME}: recibes clientes nuevos cada vez que alguien recoge sus cartas y la app te da una cuenta de tienda para registrar recepciones y retiros en segundos. Escríbenos a <a href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a>.</p>
          </div>
          <p className="small muted">¿Dudas sobre la entrega? Lee el <Link href="/ayuda#tiendas">centro de ayuda</Link>.</p>
        </div>
      </main>
      <PiePublico />
    </div>
  );
}
