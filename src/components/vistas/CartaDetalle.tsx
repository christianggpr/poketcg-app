'use client';
import { Icono, PuntoEnergia } from '../Icono';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cardTypeKey, cardTypeLabel, nombreCarta, nombreColeccion, numLabel, rarezaLabel } from '@/lib/catalogo';
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
import { albumesPorColeccion } from '@/lib/sugerir';

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
  if (!carta) return <div className="empty"><div className="big"><Icono n="buscar" tam={44} grosor={1.5} /></div>Esa carta no está en el catálogo. <Link href="/app/buscar">Volver a buscar</Link></div>;
  const set = cat.setOf(carta);
  const idioma = perfil.idioma_nombres;
  const propias = col.entradas.filter(e => e.carta_id === carta.id);
  const rec = precios.registro(carta.id);
  const v = precios.valor(carta, '');
  const defecto = precios.precioDefecto(carta, '');
  const fx = precios.ajustes.fx;
  // Imagen en el idioma de tus copias (español si las tienes en ES); grande, y si no carga, la pequeña
  const idiomaImg = propias.find(e => e.idioma === 'ES') ? 'ES' : propias[0]?.idioma || null;
  const especie = carta.dex && carta.dex.length ? cat.especie(carta.dex[0]) : undefined;
  const cartaId = carta.id;
  const favorita = mercado.esFavorita(cartaId);
  async function alternarFavorita() {
    try { const ahora = await mercado.alternarFavorita(cartaId); toast(ahora ? 'En tu lista de deseos: te avisamos cuando alguien la publique' : 'Quitada de tu lista de deseos', ahora ? 'ok' : undefined, 3500); }
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

  // "Te falta en tu álbum": colecciono esta colección (en algún idioma) y no tengo la carta
  const albumFalta = (() => { if (propias.length || !set) return null; const porCol = [...albumesPorColeccion(cat, col.entradas).values()].filter(v => v.set === set.id).sort((a, b) => b.cartas - a.cartas)[0]; return porCol ? porCol.idioma : null; })();
  const precioMercado = v && v.finishes.length ? v.finishes[0] : null;
  const nombreSet = nombreColeccion(set, idioma, true);
  return (
    <div className="carta-detalle">
      <p className="small migas solo-pc-block"><Link href="/app/mercado" className="miga"><Icono n="izquierda" tam={16} /> Mercado</Link><span className="muted"> · </span><Link href="/app/buscar" className="miga">Buscar</Link>{set ? <><span className="muted"> · </span><Link href={`/app/album/${encodeURIComponent(set.id)}`} className="miga">Álbum {nombreSet}</Link></> : null}</p>
      <div className="carta-cuerpo">
        <div className="carta-imagen">
          <Thumb carta={carta} set={set} className="xl imagen-grande" alt={nombreCarta(carta, idioma)} idioma={idiomaImg} grande prioridad />
          {!carta.sd ? (
            <div className="acciones-carta">
              <button className={`btn ${favorita ? 'primary' : ''}`} onClick={alternarFavorita} title={favorita ? 'Quitar de mi lista de deseos' : 'Agregar a mi lista de deseos'} aria-pressed={favorita} data-testid="btn-favorito"><Icono n="corazon" relleno={favorita} /> {favorita ? 'Favorita' : 'Favorito'}</button>
              <button className="btn" onClick={compartir} title="Compartir la ficha pública" data-testid="btn-compartir"><Icono n="compartir" /> Compartir</button>
            </div>
          ) : null}
        </div>
        <div className="carta-contenido">
          <div className="carta-cabecera">
            <div className="grow" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>{nombreCarta(carta, idioma)}{carta.sd ? <> <span className="badge-sd">sin datos</span></> : null}</h1>
              <div className="small muted" style={{ marginTop: 4 }}>{nombreSet} · {numLabel(carta, set)}{carta.r ? ` · ${rarezaLabel(carta.r)}` : ''}{[carta.n, carta.ns, carta.nj].filter((x, k, a) => x && a.indexOf(x) === k && x !== nombreCarta(carta, idioma)).length ? <span className="faint"> · {[carta.n, carta.ns, carta.nj].filter((x, k, a) => x && a.indexOf(x) === k && x !== nombreCarta(carta, idioma)).join(' · ')}</span> : null}</div>
            </div>
            {!carta.sd ? <div className="panel precio-mercado" data-testid="precio-mercado"><span className="small muted">Precio de mercado</span><span className="precio-grande">{rec || v ? fmtPen(defecto.pen) : '…'}</span>{defecto.origen === 'piso' ? <span className="small muted">piso de {fmtPen(defecto.piso)}</span> : precioMercado ? <span className="small muted">{precioMercado.label}{precioMercado.usd != null ? ` · ${fmtUsd(precioMercado.usd)}` : ''}</span> : null}</div> : null}
          </div>
          {albumFalta ? <div className="notice info" style={{ margin: '12px 0' }} data-testid="aviso-falta-album">Te falta en tu álbum <b>{nombreSet} {albumFalta}</b> (casilla {carta.l}).</div> : null}
          {carta.sd ? <p className="notice warn small">Esta casilla existe porque la colección tiene {set?.ct || set?.cc} cartas, pero al catálogo aún le faltan los datos de esta. Puedes guardarla igual en un Bulk.</p> : null}
          {!carta.sd ? <OfertasCarta carta={carta} /> : null}
          <div className="bloque">
            <h3><span>En tu colección</span><span className="count">{propias.reduce((n, e) => n + e.cantidad, 0)}</span></h3>
            {propias.length ? (
              <div className="card-list">
                {propias.map(e => (
                  <div className="card-row" key={e.id} role="button" tabIndex={0} onClick={() => setEditar(e)}>
                    <div className="card-main">
                      <div className="card-name">×{e.cantidad} {e.acabado ? <span className="pill">{e.acabado}</span> : null} {e.idioma ? <span className={`pill ${e.idioma === 'JP' ? 'jp' : 'info'}`}>{e.idioma}</span> : null} {e.condicion ? <span className={`pill ${e.condicion === 'NM' ? 'ok' : ''}`}>{e.condicion}</span> : null} <EstadoPub pub={col.publicacionDe(e.id)} entrada={e} /></div>
                      <div className="card-set"><LocChip loc={ubicador.donde(e)} /> <span className="faint">· añadida {haceCuanto(e.creado_en)}</span>{e.nota ? <div className="small muted">{e.nota}</div> : null}</div>
                    </div>
                    <div className="card-side">{(() => { const dd = precios.precioDefecto(carta, e.acabado); return <span className={`price ${dd.origen === 'piso' ? 'piso' : ''}`}>{fmtPen(dd.pen * e.cantidad)}</span>; })()}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Todavía no la tienes.</p>}
            <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setAgregar(true)} data-testid="btn-guardar-coleccion">+ Guardar en mi colección</button>
          </div>
          <div className="bloque">
            <h3><span>Datos de la carta</span></h3>
            <div className="panel">
              <dl className="kv">
                <dt>Colección</dt><dd><SimboloSet setId={carta.s} /> {nombreSet}{set?.ab ? <span className="faint"> ({set.ab})</span> : null}</dd>
                <dt>Número</dt><dd>{numLabel(carta, set)}</dd>
                {carta.r ? <><dt>Rareza</dt><dd>{rarezaLabel(carta.r)}</dd></> : null}
                {carta.c !== '?' ? <><dt>Tipo</dt><dd>{carta.c === 'P' ? <PuntoEnergia tipo={cardTypeKey(carta)} /> : null} {cardTypeLabel(carta)}{carta.hp ? ` · ${carta.hp} PS` : ''}</dd></> : null}
                {especie ? <><dt>Pokédex</dt><dd>N.º {especie[0]} {especie[2]}{especie[3] ? <span className="faint"> · {especie[3]}</span> : null}</dd></> : null}
                {carta.il ? <><dt>Ilustración</dt><dd>{carta.il}</dd></> : null}
                {carta.rm ? <><dt>Regulación</dt><dd>{carta.rm}</dd></> : null}
                {set?.d ? <><dt>Fecha</dt><dd>{set.d}</dd></> : null}
              </dl>
              {!carta.sd ? (
                <div style={{ marginTop: 10 }}>
                  {v ? (
                    <div className="finishes">{v.finishes.map(f => { const esCm = v.src === 'Cardmarket'; const eur = esCm ? f.usd / (precios.fx || 1) : null; const pen = esCm ? (eur as number) * fx.eur_pen : f.usd * fx.usd_pen; return <span key={f.k} className="pill" title={v.src}>{f.label} <b>{fmtPen(pen)}</b> <span className="muted">{esCm ? `€${(eur as number).toFixed(2)}` : fmtUsd(f.usd)}</span></span>; })}</div>
                  ) : rec ? <p className="small muted">Sin precio de mercado para esta carta{carta.sinTcgdex ? ' (no está en TCGdex)' : ''}.</p> : <p className="small muted">Consultando…</p>}
                  <p className="small muted" style={{ marginTop: 6 }}>{v ? `Fuente: ${v.src} · cambio US$1 = S/ ${fx.usd_pen.toFixed(3)}. ` : ''}Precio por defecto en el mercado PokéTCG: <b>{fmtPen(defecto.pen)}</b> ({defecto.origen === 'piso' ? `piso de ${fmtPen(defecto.piso)}` : 'precio de mercado'}; con acabado reverse/holo el piso es {fmtPen(precios.ajustes.pisos.especial)}).</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {agregar ? <AddEntrySheet carta={carta} onClose={() => setAgregar(false)} /> : null}
      {editar ? <EntryDetailSheet entrada={editar} onClose={() => setEditar(null)} /> : null}
    </div>
  );
}
