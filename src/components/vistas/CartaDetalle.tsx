'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cardTypeIcon, cardTypeLabel, nombreCarta, nombreColeccion, numLabel, rarezaLabel, urlImagenGrande } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen, fmtUsd } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { SimboloSet } from '../CardRow';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { AddEntrySheet } from '../AddEntrySheet';
import { EntryDetailSheet } from '../EntryDetailSheet';
import { EstadoPub } from '../PublicarSheet';
import { OfertasCarta } from '../OfertasCarta';
import { useToast } from '../Toast';
import { haceCuanto } from '../ui';

export function CartaDetalle({ id }: { id: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const mercado = useMercado();
  const toast = useToast();
  const [agregar, setAgregar] = useState(false);
  const [editar, setEditar] = useState<Entrada | null>(null);
  const carta = cat.carta(id);
  useEffect(() => { if (carta && !carta.sd) precios.pedir([carta.id]); }, [carta, precios]);
  if (!carta) return <div className="empty"><div className="big">🫥</div>Esa carta no está en el catálogo. <Link href="/app">Volver a buscar</Link></div>;
  const set = cat.setOf(carta);
  const idioma = perfil.idioma_nombres;
  const propias = col.entradas.filter(e => e.carta_id === carta.id);
  const rec = precios.registro(carta.id);
  const v = precios.valor(carta, '');
  const defecto = precios.precioDefecto(carta, '');
  const fx = precios.ajustes.fx;
  const grande = urlImagenGrande(carta, set);
  const especie = carta.dex && carta.dex.length ? cat.especie(carta.dex[0]) : undefined;
  const cartaId = carta.id;
  const favorita = mercado.esFavorita(cartaId);
  async function alternarFavorita() {
    try { const ahora = await mercado.alternarFavorita(cartaId); toast(ahora ? '❤️ En tu lista de deseos: te avisamos cuando alguien la publique' : 'Quitada de tu lista de deseos', ahora ? 'ok' : undefined, 3500); }
    catch (e) { toast((e as Error).message || 'No se pudo guardar', 'danger'); }
  }
  async function compartir() {
    const url = `${location.origin}/carta/${encodeURIComponent(cartaId)}`;
    const titulo = `${nombreCarta(cat.carta(cartaId)!, idioma)} · PokéTCG`;
    try {
      if (navigator.share) { await navigator.share({ title: titulo, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado: cualquiera puede ver la ficha pública, con precio y ofertas', 'ok', 3500);
    } catch { /* cancelado */ }
  }

  return (
    <div>
      <p className="small"><Link href="/app">← Buscar</Link>{set ? <> · <Link href={`/app/album/${encodeURIComponent(set.id)}`}>Álbum {nombreColeccion(set, idioma)}</Link></> : null}</p>
      <div className="detail-grid">
        <div>
          {grande ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb xl" src={grande} alt="" style={{ width: '100%', height: 'auto', maxWidth: 320 }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Thumb carta={carta} set={set} className="xl" />}
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <h2 style={{ marginTop: 0 }}>{nombreCarta(carta, idioma)}{carta.sd ? <> <span className="badge-sd">sin datos</span></> : null}</h2>
            {!carta.sd ? <div className="row" style={{ gap: 4, flex: 'none' }}>
              <button className={`btn sm ${favorita ? 'primary' : ''}`} onClick={alternarFavorita} title={favorita ? 'Quitar de mi lista de deseos' : 'Agregar a mi lista de deseos'} aria-pressed={favorita} data-testid="btn-favorito">{favorita ? '❤️' : '🤍'}</button>
              <button className="btn sm" onClick={compartir} title="Compartir la ficha pública" data-testid="btn-compartir">🔗</button>
            </div> : null}
          </div>
          <p className="muted">{[carta.n, carta.ns, carta.nj].filter((x, i, a) => x && a.indexOf(x) === i && x !== nombreCarta(carta, idioma)).join(' · ')}</p>
          <dl className="kv">
            <dt>Colección</dt><dd><SimboloSet setId={carta.s} /> {nombreColeccion(set, idioma, true)}{set?.ab ? <span className="faint"> ({set.ab})</span> : null}</dd>
            <dt>Número</dt><dd>{numLabel(carta, set)}</dd>
            {carta.r ? <><dt>Rareza</dt><dd>{rarezaLabel(carta.r)}</dd></> : null}
            {carta.c !== '?' ? <><dt>Tipo</dt><dd>{cardTypeIcon(carta)} {cardTypeLabel(carta)}{carta.hp ? ` · ${carta.hp} PS` : ''}</dd></> : null}
            {especie ? <><dt>Pokédex</dt><dd>N.º {especie[0]} {especie[2]}{especie[3] ? <span className="faint"> · {especie[3]}</span> : null}</dd></> : null}
            {carta.il ? <><dt>Ilustración</dt><dd>{carta.il}</dd></> : null}
            {carta.rm ? <><dt>Regulación</dt><dd>{carta.rm}</dd></> : null}
            {set?.d ? <><dt>Fecha</dt><dd>{set.d}</dd></> : null}
          </dl>
          {carta.sd ? <p className="notice warn small">Esta casilla existe porque la colección tiene {set?.ct || set?.cc} cartas, pero al catálogo aún le faltan los datos de esta. Puedes guardarla igual en una caja.</p> : null}
          <div className="bloque">
            <h3><span>Precio de mercado</span></h3>
            {v ? (
              <div className="finishes">{v.finishes.map(f => { const esCm = v.src === 'Cardmarket'; const eur = esCm ? f.usd / (precios.fx || 1) : null; const pen = esCm ? (eur as number) * fx.eur_pen : f.usd * fx.usd_pen; return <span key={f.k} className="pill">{f.label} <b>{fmtPen(pen)}</b> <span className="faint">{esCm ? `€${(eur as number).toFixed(2)}` : fmtUsd(f.usd)}</span></span>; })}<span className="small muted">Fuente: {v.src} · cambio {v.src === 'Cardmarket' ? `€1 = S/ ${fx.eur_pen.toFixed(3)}` : `US$1 = S/ ${fx.usd_pen.toFixed(3)}`}</span></div>
            ) : rec ? <p className="small muted">Sin precio de mercado para esta carta{carta.sinTcgdex ? ' (no está en TCGdex)' : ''}.</p> : <p className="small muted">Consultando…</p>}
            <p className="small" style={{ marginTop: 6 }}>Precio por defecto en el mercado PokéTCG: <b>{fmtPen(defecto.pen)}</b> <span className="muted">({defecto.origen === 'piso' ? `piso de ${fmtPen(defecto.piso)}` : 'valor de mercado'}; con acabado reverse/holo el piso es {fmtPen(precios.ajustes.pisos.especial)})</span></p>
          </div>
          <div className="bloque">
            <h3><span>En tu colección</span><span className="count">{propias.reduce((n, e) => n + e.cantidad, 0)}</span></h3>
            {propias.length ? (
              <div className="card-list">
                {propias.map(e => (
                  <div className="card-row" key={e.id} role="button" tabIndex={0} onClick={() => setEditar(e)}>
                    <div className="card-main">
                      <div className="card-name">×{e.cantidad} {e.acabado ? <span className="pill">{e.acabado}</span> : null} {e.idioma ? <span className="pill">{e.idioma}</span> : null} {e.condicion ? <span className="pill">{e.condicion}</span> : null} <EstadoPub pub={col.publicacionDe(e.id)} /></div>
                      <div className="card-set"><LocChip loc={ubicador.ubicacion(e)} /> <span className="faint">· añadida {haceCuanto(e.creado_en)}</span>{e.nota ? <div className="small muted">{e.nota}</div> : null}</div>
                    </div>
                    <div className="card-side">{(() => { const dd = precios.precioDefecto(carta, e.acabado); return <span className={`price ${dd.origen === 'piso' ? 'piso' : ''}`}>{fmtPen(dd.pen * e.cantidad)}</span>; })()}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Todavía no la tienes.</p>}
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setAgregar(true)}>+ Guardar en una caja</button>
          </div>
          {!carta.sd ? <div className="bloque" id="mercado"><OfertasCarta carta={carta} /></div> : null}
        </div>
      </div>
      {agregar ? <AddEntrySheet carta={carta} onClose={() => setAgregar(false)} /> : null}
      {editar ? <EntryDetailSheet entrada={editar} onClose={() => setEditar(null)} /> : null}
    </div>
  );
}
