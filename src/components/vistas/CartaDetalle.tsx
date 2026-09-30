'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cardTypeIcon, cardTypeLabel, nombreCarta, nombreColeccion, numLabel, rarezaLabel, urlImagenGrande } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtUsd } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { SimboloSet } from '../CardRow';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { AddEntrySheet } from '../AddEntrySheet';
import { EntryDetailSheet } from '../EntryDetailSheet';
import { haceCuanto } from '../ui';

export function CartaDetalle({ id }: { id: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
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
  const grande = urlImagenGrande(carta, set);
  const especie = carta.dex && carta.dex.length ? cat.especie(carta.dex[0]) : undefined;

  return (
    <div>
      <p className="small"><Link href="/app">← Buscar</Link>{set ? <> · <Link href={`/app/album/${encodeURIComponent(set.id)}`}>Álbum {nombreColeccion(set, idioma)}</Link></> : null}</p>
      <div className="detail-grid">
        <div>
          {grande ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="thumb xl" src={grande} alt="" style={{ width: '100%', height: 'auto', maxWidth: 320 }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <Thumb carta={carta} set={set} className="xl" />}
        </div>
        <div>
          <h2 style={{ marginTop: 0 }}>{nombreCarta(carta, idioma)}{carta.sd ? <> <span className="badge-sd">sin datos</span></> : null}</h2>
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
              <div className="finishes">{v.finishes.map(f => <span key={f.k} className="pill">{f.label} <b>{fmtUsd(f.usd)}</b></span>)}<span className="small muted">Fuente: {v.src}{v.src === 'Cardmarket' ? ' (EUR convertido)' : ''}</span></div>
            ) : rec ? <p className="small muted">Sin precio publicado para esta carta.</p> : <p className="small muted">Consultando…</p>}
          </div>
          <div className="bloque">
            <h3><span>En tu colección</span><span className="count">{propias.reduce((n, e) => n + e.cantidad, 0)}</span></h3>
            {propias.length ? (
              <div className="card-list">
                {propias.map(e => (
                  <div className="card-row" key={e.id} role="button" tabIndex={0} onClick={() => setEditar(e)}>
                    <div className="card-main">
                      <div className="card-name">×{e.cantidad} {e.acabado ? <span className="pill">{e.acabado}</span> : null} {e.idioma ? <span className="pill">{e.idioma}</span> : null} {e.condicion ? <span className="pill">{e.condicion}</span> : null}</div>
                      <div className="card-set"><LocChip loc={ubicador.ubicacion(e)} /> <span className="faint">· añadida {haceCuanto(e.creado_en)}</span>{e.nota ? <div className="small muted">{e.nota}</div> : null}</div>
                    </div>
                    <div className="card-side">{(() => { const vv = precios.valor(carta, e.acabado); return vv ? <span className="price">{fmtUsd(vv.usd * e.cantidad)}</span> : null; })()}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Todavía no la tienes.</p>}
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setAgregar(true)}>+ Guardar en una caja</button>
          </div>
        </div>
      </div>
      {agregar ? <AddEntrySheet carta={carta} onClose={() => setAgregar(false)} /> : null}
      {editar ? <EntryDetailSheet entrada={editar} onClose={() => setEditar(null)} /> : null}
    </div>
  );
}
