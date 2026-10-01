'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Carta } from '@/lib/catalogo';
import { matchesType, ordenarCartas } from '@/lib/catalogo';
import { buscarCatalogo } from '@/lib/buscar';
import { agruparPorColeccion, totalCartas, ts } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { CardRow, SimboloSet } from '../CardRow';
import { FilterBar, type Filtro } from '../FilterBar';
import { usePedirPrecios } from '../Precio';
import { AddEntrySheet } from '../AddEntrySheet';

export function Buscar() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [qLenta, setQLenta] = useState(q);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  useEffect(() => { const t = setTimeout(() => setQLenta(q), 120); return () => clearTimeout(t); }, [q]);

  const resultados = useMemo(() => (qLenta.trim() ? buscarCatalogo(cat, qLenta, 60) : []), [cat, qLenta]);
  const ubicador = useUbicador();

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <span className="ico">🔍</span>
          <input className="input" placeholder="Nombre en cualquier idioma, número (025/165), colección (151, obsidian, sv2a)…" value={q} onChange={e => setQ(e.target.value)} />
          {q ? <button className="clear" onClick={() => setQ('')} aria-label="Borrar">✕</button> : null}
        </div>
        <Link href="/app/escanear" className="btn" title="Identificar una carta con la cámara" data-testid="btn-escanear" style={{ flex: 'none' }}>📷 Escanear</Link>
      </div>
      {qLenta.trim() ? (
        <div className="card-list" style={{ marginTop: 10 }}>
          {resultados.map(r => (
            <CardRow key={r.card.id} carta={r.card} entradas={col.entradas.filter(e => e.carta_id === r.card.id)} ubicador={ubicador}
              extra={<div style={{ marginTop: 4 }}><button className="btn sm" onClick={e => { e.stopPropagation(); setAgregar(r.card); }}>+ Guardar en mi colección</button></div>} />
          ))}
          {!resultados.length ? <div className="empty"><div className="big">🫥</div>No encontré esa carta. Prueba con el nombre en inglés, el número con el total (025/165) o el código de la colección.</div> : null}
          <p className="small muted">Busca por nombre en español, inglés o japonés, por número ("25", "025/165", "TG12"), por colección ("151", "obsidian", "sv2a", "jp") o combinaciones ("pikachu 151").</p>
        </div>
      ) : (
        <MiColeccion onAgregar={c => setAgregar(c)} />
      )}
      {agregar ? <AddEntrySheet carta={agregar} onClose={() => setAgregar(null)} /> : null}
    </div>
  );
}

function MiColeccion({ onAgregar }: { onAgregar: (c: Carta) => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const idioma = perfil.idioma_nombres;
  const [f, setF] = useState<Filtro>({ sort: 'recent', type: '', lang: '' });
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const ids = useMemo(() => [...new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x))], [col.entradas]);
  usePedirPrecios(ids);

  // Precio de la colección = Σ precio por defecto (máx(piso, mercado)) × cantidad, en soles
  const valor = useMemo(() => {
    let pen = 0, conMercado = 0;
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c || c.sd) continue;
      const d = precios.precioDefecto(c, e.acabado);
      pen += d.pen * e.cantidad;
      if (d.mercado) conMercado += e.cantidad;
    }
    return { pen: Math.round(pen * 100) / 100, conMercado };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [col.entradas, cat, precios.version]);

  const langs = useMemo(() => [...new Set(col.entradas.map(e => e.idioma).filter(Boolean))].sort(), [col.entradas]);
  const filtradas = useMemo(() => col.entradas.filter(e => { const c = cat.carta(e.carta_id); return (!f.lang || e.idioma === f.lang) && (!f.type || (c ? matchesType(c, f.type) : false)); }), [col.entradas, cat, f]);
  const grupos = useMemo(() => agruparPorColeccion(cat, filtradas, idioma), [cat, filtradas, idioma]);
  const total = totalCartas(col.entradas);

  if (!col.entradas.length) {
    return (
      <div className="empty" style={{ marginTop: 20 }}>
        <div className="big">📦</div>
        <p><b>Tu colección está vacía.</b></p>
        <p className="muted">Busca una carta arriba y guárdala en tu colección (álbum o Bulk), o crea tus Bulks desde la sección Bulk. Si vienes de PokéBóveda (versión anterior), importa tu respaldo en Ajustes.</p>
      </div>
    );
  }

  const addedAt = (c: Carta) => Math.max(0, ...col.entradas.filter(e => e.carta_id === c.id).map(e => ts(e.creado_en)));
  const priceOf = (c: Carta) => precios.precioDefecto(c, col.entradas.find(e => e.carta_id === c.id)?.acabado || '').pen;

  return (
    <div style={{ marginTop: 14 }}>
      <div className="stat" style={{ marginBottom: 12 }}>
        <div className="box"><b>{total.toLocaleString('es-PE')}</b><span>cartas ({col.entradas.length} distintas)</span></div>
        <div className="box" title="Suma del precio por defecto del mercado PokéTCG (máximo entre el piso y el precio de mercado) por la cantidad de cada carta"><b>{precios.version === 0 && precios.cargando ? '…' : fmtPen(valor.pen)}</b><span>precio estimado ({valor.conMercado} con precio de mercado){precios.cargando ? ' · actualizando…' : ''}</span></div>
        <div className="box"><b>{col.cajas.length}</b><span>{col.cajas.length === 1 ? 'caja' : 'cajas'}</span></div>
      </div>
      <FilterBar f={f} onChange={setF} langs={langs} />
      {grupos.map(g => {
        const abierto = abiertos[g.key] ?? (grupos.length <= 12 || g.entradas.length <= 30);
        const cartas = ordenarCartas(cat, g.cartas, f.sort, idioma, { addedAt, priceOf });
        const unidades = totalCartas(g.entradas);
        return (
          <div className="bloque" key={g.key}>
            <h3 style={{ cursor: 'pointer' }} onClick={() => setAbiertos(a => ({ ...a, [g.key]: !abierto }))}>
              <span>{abierto ? '▾' : '▸'} {g.set ? <SimboloSet setId={g.set.id} /> : null} {g.nombre}</span>
              <span className="count">{unidades} {unidades === 1 ? 'carta' : 'cartas'}{g.set ? ` · ${g.cartas.length}/${cat.cartasDe(g.set.id).filter(c => !c.sd).length}` : ''}</span>
            </h3>
            {abierto ? (
              <div className="card-list">
                {cartas.map(c => <CardRow key={c.id} carta={c} entradas={g.entradas.filter(e => e.carta_id === c.id)} ubicador={ubicador} extra={<div style={{ marginTop: 4 }}><button className="btn sm ghost" onClick={e => { e.stopPropagation(); onAgregar(c); }}>+ otra copia</button></div>} />)}
                {g.entradas.filter(e => !e.carta_id).map(e => (
                  <div className="card-row" key={e.id} style={{ cursor: 'default' }}>
                    <div className="thumb" />
                    <div className="card-main"><div className="card-name">{e.personalizada?.nombre}</div><div className="card-set">{e.personalizada?.coleccion} <span className="num">{e.personalizada?.numero}</span> <span className="pill">personalizada</span> ×{e.cantidad}</div></div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
