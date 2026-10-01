import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ADMIN_EMAIL, APP_NAME, ETIQUETA_CONDICION, appUrl } from '@/lib/config';
import { RARITY_ES } from '@/lib/catalogo';
import { fmtPen, valorMercadoPen, type TipoCambio } from '@/lib/precios-core';
import { cargarAjustes } from '@/lib/ajustes';
import { preciosDe } from '@/lib/tcgdex';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cartaPublica, ofertasPublicas, resumenVentas, supabasePublico, vendedoresPorId, ventasCarta } from '@/lib/publico';
import { usuarioActual } from '@/lib/supabase/server';
import { BarraPublica, PiePublico } from '@/components/portada/BarraPublica';
import { Estrellas } from '@/components/Vendedor';

export const dynamic = 'force-dynamic';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const ACABADO_TXT: Record<string, string> = { normal: 'Normal', holofoil: 'Holo', 'reverse-holofoil': 'Reverse holo', '1st-edition': '1.ª edición', '1st-edition-holofoil': '1.ª edición holo', unlimited: 'Ilimitada', 'unlimited-holofoil': 'Ilimitada holo' };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await cartaPublica(supabasePublico(), decodeURIComponent(id));
  if (!c) return { title: 'Carta no encontrada' };
  const titulo = `${c.nombre} ${c.numero}${c.total} · ${c.coleccion} · precio en Perú`;
  const descripcion = `${c.nombre} (${c.coleccion} ${c.numero}${c.total}): precio de referencia en soles, ofertas de coleccionistas y últimas ventas en ${APP_NAME}, el mercado Pokémon TCG con entrega en tienda en Lima.`;
  return { title: titulo, description: descripcion, alternates: { canonical: `${appUrl()}/carta/${encodeURIComponent(c.id)}` }, openGraph: { title: titulo, description: descripcion, type: 'website', images: c.imagen_grande ? [{ url: c.imagen_grande }] : undefined } };
}

/** Ficha pública de una carta (visible sin cuenta y para Google): datos, precio de referencia, ofertas y ventas. */
export default async function FichaCarta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cartaId = decodeURIComponent(id);
  const sb = supabasePublico();
  const [carta, user] = await Promise.all([cartaPublica(sb, cartaId), usuarioActual()]);
  if (!carta) notFound();
  const [ofertas, ventas] = await Promise.all([ofertasPublicas(sb, { cartaId, limite: 50 }), ventasCarta(sb, cartaId, 30)]);
  const vendedores = await vendedoresPorId(sb, ofertas.map(o => o.vendedor_id));
  // precio de referencia (TCGplayer / Cardmarket en soles): si la fuente no responde, la ficha se muestra igual
  let referencia: { finishes: { label: string; pen: number }[]; fuente: string; fx: TipoCambio } | null = null;
  if (!carta.sin_datos) {
    try {
      const admin = supabaseAdmin();
      const [ajustes, { registros }] = await Promise.all([cargarAjustes(admin), preciosDe(admin, [cartaId])]);
      const rec = registros[0];
      if (rec?.ok) {
        if (rec.tp) referencia = { finishes: Object.entries(rec.tp).filter(([, usd]) => usd != null).map(([k, usd]) => ({ label: ACABADO_TXT[k] || k, pen: Math.round(usd * ajustes.fx.usd_pen * 100) / 100 })), fuente: 'TCGplayer', fx: ajustes.fx };
        else { const v = valorMercadoPen(rec, '', ajustes.fx); if (v) referencia = { finishes: [{ label: v.label, pen: v.pen }], fuente: v.src, fx: ajustes.fx }; }
      }
    } catch { /* sin precio de referencia */ }
  }
  const resumen = resumenVentas(ventas);
  const disponibles = ofertas.reduce((n, o) => n + o.disponibles, 0);
  const desde = ofertas.length ? Math.min(...ofertas.map(o => o.precio_pen)) : null;
  const hasta = ofertas.length ? Math.max(...ofertas.map(o => o.precio_pen)) : null;
  const enlaceApp = `/app/carta/${encodeURIComponent(carta.id)}#mercado`;
  const comprar = user ? enlaceApp : `/ingresar?volver=${encodeURIComponent(enlaceApp)}`;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: `${carta.nombre} ${carta.numero}${carta.total} (${carta.coleccion})`, image: carta.imagen_grande || undefined, sku: carta.id, category: 'Pokémon TCG',
    brand: { '@type': 'Brand', name: 'Pokémon TCG' },
    ...(ofertas.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'PEN', lowPrice: desde, highPrice: hasta, offerCount: ofertas.length, availability: 'https://schema.org/InStock', url: `${appUrl()}/carta/${encodeURIComponent(carta.id)}` } } : {})
  };
  return (
    <div id="app">
      <BarraPublica conSesion={!!user} volver={`/carta/${encodeURIComponent(carta.id)}`} />
      <main id="main">
        <div className="legal" data-testid="ficha-publica" style={{ paddingTop: 8 }}>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          <p className="small"><Link href={user ? '/app/mercado' : '/'}>← {user ? 'Mercado' : APP_NAME}</Link>{user ? <> · <Link href={enlaceApp}>Ver en la app</Link></> : null}</p>
          <div className="detail-grid">
            <div>
              {carta.imagen_grande ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb xl" src={carta.imagen_grande} alt={`${carta.nombre} ${carta.numero}${carta.total}`} style={{ width: '100%', height: 'auto', maxWidth: 320 }} /> : <div className="thumb xl" style={{ maxWidth: 320, display: 'grid', placeItems: 'center' }}>🃏</div>}
            </div>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 26 }} data-testid="ficha-nombre">{carta.nombre}</h1>
              <p className="muted" style={{ marginTop: -6 }}>{[carta.nombre_en, carta.nombre_ja].filter((x, i, a) => x && x !== carta.nombre && a.indexOf(x) === i).join(' · ')}</p>
              <dl className="kv">
                <dt>Colección</dt><dd>{carta.coleccion}{carta.abreviatura ? <span className="faint"> ({carta.abreviatura})</span> : null}{carta.region === 'ja' ? <span className="pill" style={{ marginLeft: 6 }}>JP</span> : null}</dd>
                <dt>Número</dt><dd>{carta.numero}{carta.total}</dd>
                {carta.rareza ? <><dt>Rareza</dt><dd>{RARITY_ES[carta.rareza] || carta.rareza}</dd></> : null}
                {carta.tipos.length || carta.hp ? <><dt>Tipo</dt><dd>{carta.tipos.join(' / ')}{carta.hp ? ` · ${carta.hp} PS` : ''}</dd></> : null}
                {carta.ilustrador ? <><dt>Ilustración</dt><dd>{carta.ilustrador}</dd></> : null}
                {carta.fecha ? <><dt>Lanzamiento</dt><dd>{fecha(carta.fecha + 'T12:00:00Z')}</dd></> : null}
              </dl>

              <div className="bloque">
                <h3><span>Precio de referencia</span></h3>
                {referencia ? <div className="finishes">{referencia.finishes.map(f => <span key={f.label} className="pill">{f.label} <b>{fmtPen(f.pen)}</b></span>)}<span className="small muted">Fuente: {referencia.fuente} en soles (cambio US$1 = S/ {referencia.fx.usd_pen.toFixed(3)}). Es referencial; el precio final lo pone cada vendedor.</span></div> : <p className="small muted">Sin precio de referencia para esta carta.</p>}
              </div>

              <div className="bloque" id="ofertas">
                <h3><span>En venta en {APP_NAME}</span><span className="count">{disponibles}</span></h3>
                {ofertas.length ? (
                  <>
                    <p className="small" style={{ marginTop: 0 }} data-testid="ficha-desde"><b>{disponibles} {disponibles === 1 ? 'copia' : 'copias'}</b> de {ofertas.length} {ofertas.length === 1 ? 'vendedor' : 'ofertas'} · desde <b>{fmtPen(desde || 0)}</b>{hasta !== desde ? ` hasta ${fmtPen(hasta || 0)}` : ''} · sin costo de envío: recoges en una <Link href="/tiendas">tienda aliada</Link> con tu código de retiro.</p>
                    <div className="card-list">
                      {ofertas.map(o => { const v = vendedores.get(o.vendedor_id); const rep = v?.reputacion || {}; return (
                        <div key={o.id} className="card-row" style={{ cursor: 'default' }} data-testid="ficha-oferta">
                          <div className="card-main">
                            <div className="card-name">{fmtPen(o.precio_pen)} <span className="small muted">× {o.disponibles}</span> {o.condicion ? <span className="pill" title={ETIQUETA_CONDICION[o.condicion] || ''}>{o.condicion}</span> : null}{o.idioma ? <span className="pill">{o.idioma}</span> : null}{o.acabado ? <span className="pill">{o.acabado}</span> : null}{o.fotos.length ? <span className="pill ok">📷 foto real</span> : null}</div>
                            <div className="card-set"><Link href={`/u/${encodeURIComponent(o.vendedor)}`}>@{o.vendedor}</Link>{rep.puntaje != null ? <> · <Estrellas valor={Math.round(Number(rep.puntaje))} tam={12} /> {Number(rep.puntaje).toFixed(1)}</> : null}{rep.ventas ? ` · ${rep.ventas} ventas` : ' · vendedor nuevo'}</div>
                          </div>
                          <div className="card-side"><Link className="btn sm primary" href={comprar}>Comprar</Link></div>
                        </div>
                      ); })}
                    </div>
                  </>
                ) : <p className="small muted" data-testid="ficha-sin-ofertas">Nadie la tiene en venta ahora. {user ? <Link href={enlaceApp}>Márcala como favorita</Link> : <Link href={`/ingresar?volver=${encodeURIComponent(enlaceApp)}`}>Ingresa y márcala como favorita</Link>} y te avisamos cuando alguien la publique.</p>}
              </div>

              <div className="bloque">
                <h3><span>Últimas ventas en {APP_NAME}</span><span className="count">{resumen?.copias || 0}</span></h3>
                {resumen ? (
                  <>
                    <p className="small" style={{ marginTop: 0 }} data-testid="ficha-promedio">Promedio <b>{fmtPen(resumen.promedio)}</b> por copia ({resumen.copias} {resumen.copias === 1 ? 'vendida' : 'vendidas'}; de {fmtPen(resumen.min)} a {fmtPen(resumen.max)}) · última el {fecha(resumen.ultima!)}.</p>
                    <div className="tabla-scroll"><table className="tabla small"><thead><tr><th>Fecha</th><th className="num">Precio</th><th>Estado</th><th>Idioma</th><th>Vendedor</th></tr></thead>
                      <tbody>{ventas.map((v, i) => <tr key={i} data-testid="ficha-venta"><td>{fecha(v.entregada_en)}</td><td className="num">{fmtPen(v.precio_pen)}{v.cantidad > 1 ? ` ×${v.cantidad}` : ''}</td><td>{v.condicion || '—'}{v.acabado && v.acabado !== 'Normal' ? ` · ${v.acabado}` : ''}</td><td>{v.idioma || '—'}</td><td><Link href={`/u/${encodeURIComponent(v.vendedor)}`}>@{v.vendedor}</Link></td></tr>)}</tbody></table></div>
                  </>
                ) : <p className="small muted">Todavía no se vendió en {APP_NAME}.</p>}
              </div>

              <div className="bloque">
                <h3><span>¿Tienes esta carta?</span></h3>
                <p className="small" style={{ marginTop: 0 }}>Regístrala en tu colección y ponla en venta desde tu caja: el comprador paga por Yape o Plin, la dejas en una tienda aliada y cobras al día siguiente de la entrega (comisión 5 %, sin cargos al comprador).</p>
                <div className="row wrap" style={{ gap: 8 }}>{user ? <Link className="btn primary sm" href={enlaceApp}>Abrir en mi colección</Link> : <><Link className="btn primary sm" href="/registro">Crear mi cuenta gratis</Link><Link className="btn sm" href="/ayuda">¿Cómo funciona?</Link></>}</div>
              </div>
              <p className="small muted">Los nombres e imágenes de las cartas pertenecen a sus dueños y se muestran con fines de identificación. ¿Un dato está mal? Escríbenos a {ADMIN_EMAIL}.</p>
            </div>
          </div>
        </div>
      </main>
      <PiePublico />
    </div>
  );
}
