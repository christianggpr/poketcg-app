import Link from 'next/link';
import { notFound } from 'next/navigation';
import { APP_NAME } from '@/lib/config';
import { fmtPen } from '@/lib/precios-core';
import { ofertasPublicas, resenasPublicas, supabasePublico, vendedorPublico } from '@/lib/publico';
import { usuarioActual } from '@/lib/supabase/server';
import { Estrellas, Insignias } from '@/components/Vendedor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · vendedor en ${APP_NAME}`, description: `Cartas Pokémon TCG en venta de @${decodeURIComponent(username)} en ${APP_NAME}: reputación, reseñas y ofertas con entrega en tienda en Lima.` };
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });

/** Perfil público de un vendedor: reputación, insignias, reseñas y cartas en venta. Visible sin iniciar sesión. */
export default async function PerfilPublico({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sb = supabasePublico();
  const v = await vendedorPublico(sb, decodeURIComponent(username));
  if (!v) notFound();
  const [resenas, ofertas, user] = await Promise.all([resenasPublicas(sb, v.id, 20), ofertasPublicas(sb, { vendedorId: v.id, limite: 200 }), usuarioActual()]);
  const rep = v.reputacion || {};
  const copias = ofertas.reduce((n, o) => n + o.disponibles, 0);
  const miPerfil = user?.id === v.id;
  return (
    <main className="legal" data-testid="perfil-publico">
      <p className="small"><Link href={user ? '/app/mercado' : '/'}>← {user ? 'Mercado' : APP_NAME}</Link></p>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26 }}>@{v.username}</h1>
            <div className="small muted">Coleccionista en {APP_NAME} desde {fecha(v.creado_en)}</div>
          </div>
          {v.estado === 'suspendido' ? <span className="pill danger" data-testid="pill-suspendido">cuenta suspendida</span> : null}
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <Estrellas valor={Math.round(Number(rep.puntaje || 0))} tam={22} />
          <b data-testid="perfil-puntaje">{rep.puntaje != null ? Number(rep.puntaje).toFixed(1) : 'Sin calificaciones'}</b>
          <span className="small muted">({rep.resenas || 0} {rep.resenas === 1 ? 'reseña' : 'reseñas'})</span>
        </div>
        <div className="rep-grid" style={{ marginTop: 10 }}>
          <div className="box"><b data-testid="perfil-ventas">{rep.ventas || 0}</b><span>ventas entregadas</span></div>
          <div className="box"><b>{rep.cumple_pct != null ? `${rep.cumple_pct} %` : '—'}</b><span>entregas a tiempo</span></div>
          <div className="box"><b>{rep.confirma_horas != null ? `${rep.confirma_horas} h` : '—'}</b><span>para confirmar fecha</span></div>
          <div className="box"><b>{copias}</b><span>copias en venta</span></div>
        </div>
        <div style={{ marginTop: 10 }}><Insignias reputacion={rep} /></div>
        {miPerfil ? <p className="small muted" style={{ marginTop: 8 }}>Así te ven los compradores. Las insignias se actualizan solas con tus ventas.</p> : null}
      </div>

      <h2>Cartas en venta <span className="muted">({ofertas.length})</span></h2>
      {!ofertas.length ? <p className="small muted">No tiene cartas en venta en este momento.</p> : null}
      <div className="card-list">
        {ofertas.map(o => (
          <div key={o.id} className="card-row" style={{ cursor: 'default' }} data-testid="oferta-publica">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {o.imagen ? <img className="thumb" loading="lazy" src={o.imagen} alt="" /> : <div className="thumb" />}
            <div className="card-main">
              <div className="card-name">{o.nombre}</div>
              <div className="card-set">{o.coleccion} <span className="num">{o.numero}{o.total}</span>{o.acabado ? <span className="pill">{o.acabado}</span> : null}{o.idioma ? <span className="pill">{o.idioma}</span> : null}{o.condicion ? <span className="pill">{o.condicion}</span> : null}</div>
              <div className="small muted">{o.disponibles} {o.disponibles === 1 ? 'copia disponible' : 'copias disponibles'}</div>
            </div>
            <div className="card-side"><span className="price">{fmtPen(o.precio_pen)}</span>{user ? <Link className="btn sm" href={`/app/carta/${encodeURIComponent(o.carta_id)}`}>Ver</Link> : null}</div>
          </div>
        ))}
      </div>
      {!user ? <p className="small" style={{ marginTop: 10 }}><Link className="btn primary" href="/registro">Crear mi cuenta para comprar</Link> <Link className="btn" href="/ingresar">Ya tengo cuenta</Link></p> : null}

      <h2>Reseñas <span className="muted">({rep.resenas || 0})</span></h2>
      {!resenas.length ? <p className="small muted">Todavía no tiene reseñas.</p> : null}
      {resenas.map(r => (
        <div key={r.id} className="resena" data-testid="resena-publica">
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Estrellas valor={r.puntaje} tam={16} /><b>@{r.comprador}</b><span className="small muted">orden #{r.orden_numero} · {fecha(r.creada)}</span></div>
          {r.comentario ? <div style={{ marginTop: 4 }}>{r.comentario}</div> : null}
          {r.respuesta ? <div className="resp">Respuesta de @{v.username}: {r.respuesta}</div> : null}
        </div>
      ))}
    </main>
  );
}
