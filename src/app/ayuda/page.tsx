import { Icono } from '@/components/Icono';
import Link from 'next/link';
import { ADMIN_EMAIL, APP_NAME } from '@/lib/config';
import { datosLegales } from '@/lib/legal';
import { preguntasFrecuentes } from '@/lib/ayuda';
import { usuarioActual } from '@/lib/supabase/server';
import { BarraPublica, PiePublico } from '@/components/portada/BarraPublica';
import { Faq } from '@/components/portada/Faq';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Centro de ayuda', description: `Preguntas frecuentes de ${APP_NAME}: cómo comprar y vender cartas Pokémon TCG en Perú, pagos por Yape/Plin, entrega en tienda, código de retiro, reclamos y reputación.` };

/** Centro de ayuda público: preguntas frecuentes (4 secciones), contacto y enlaces legales. */
export default async function Ayuda() {
  const [datos, user] = await Promise.all([datosLegales(), usuarioActual()]);
  const secciones = preguntasFrecuentes(datos);
  const wa = datos.pagos.whatsapp ? `https://wa.me/51${datos.pagos.whatsapp}?text=${encodeURIComponent('Hola, tengo una consulta sobre PokéTCG')}` : null;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: secciones.flatMap(s => s.preguntas.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.a } }))) };
  return (
    <div id="app">
      <BarraPublica conSesion={!!user} volver="/ayuda" />
      <main id="main">
        <div className="legal" data-testid="ayuda" style={{ paddingTop: 8 }}>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          <p className="small"><Link href={user ? '/app' : '/'}>← {user ? 'La app' : APP_NAME}</Link></p>
          <h1>Centro de ayuda</h1>
          <p className="lead" style={{ fontSize: 16 }}>Todo lo que necesitas saber para coleccionar, comprar y vender en {APP_NAME}. Si no encuentras tu respuesta, escríbenos.</p>
          <div className="como-funciona" data-testid="como-funciona">
            <div className="paso"><div className="n">1</div><b>Elige y paga</b><span>Agrega cartas al carrito, elige la tienda donde las recogerás y paga por {datos.pagos.metodos.join(' o ') || 'Yape o Plin'}. Sin cargos extra.</span></div>
            <div className="paso"><div className="n">2</div><b>El vendedor entrega</b><span>Deja tus cartas en la tienda aliada antes de la fecha límite. Si no cumple, recuperas tu dinero con un toque.</span></div>
            <div className="paso"><div className="n">3</div><b>Recoge con tu código</b><span>Muestra tu código de retiro en la tienda, revisa las cartas ahí mismo y listo: entran solas a tu colección.</span></div>
          </div>
          <Faq secciones={secciones} />
          <div className="panel" style={{ marginTop: 20 }} id="contacto" data-testid="ayuda-contacto">
            <h3 style={{ marginTop: 0 }}>¿Todavía tienes dudas?</h3>
            <div className="row wrap" style={{ gap: 8 }}>
              {wa ? <a className="btn primary sm" href={wa} target="_blank" rel="noreferrer"><Icono n="mensaje" /> WhatsApp {datos.pagos.whatsapp}</a> : null}
              <a className="btn sm" href={`mailto:${ADMIN_EMAIL}`}><Icono n="correo" /> {ADMIN_EMAIL}</a>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>Atención: {datos.pagos.atencion}. Respondemos todos los mensajes, normalmente el mismo día. Libro de Reclamaciones disponible a pedido en el mismo correo.</p>
          </div>
          <p className="small muted">También puedes leer los <Link href="/terminos">términos y condiciones</Link>, la <Link href="/privacidad">política de privacidad</Link> y la lista de <Link href="/tiendas">tiendas de entrega</Link>.</p>
        </div>
      </main>
      <PiePublico />
    </div>
  );
}
