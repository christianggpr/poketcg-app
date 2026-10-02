'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Carta } from '@/lib/catalogo';
import { matchesType, ordenarCartas } from '@/lib/catalogo';
import { buscarCatalogo, buscarColeccion } from '@/lib/buscar';
import { agruparPorColeccion, totalCartas, ts, type Entrada } from '@/lib/coleccion';
import { cartaCumple, cuentaFiltros, entradaCumple, paramsDeFiltros, type ContextoEntrada } from '@/lib/filtros';
import { ConFiltros, useFiltrosUrl } from '../Filtros';
import { Buscador, QuisisteDecir } from '../Buscador';
import { LocChip } from '../Ubicacion';
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

/**
 * Buscar en mi colección. Mejoras 4 · E: búsqueda general (toda mi colección —álbumes y Bulk— y el catálogo completo) con
 * los mismos filtros del Mercado más Dónde y En venta; resultados agrupados en "En tu colección" (con dónde está cada
 * copia) y "Otras cartas" (del catálogo, con Agregar y Ver en el mercado); sugerencias y "¿Quisiste decir…?".
 */
export function Buscar() {
  const cat = useCatalogo();
  const col = useColeccion();
  const precios = usePrecios();
  const params = useSearchParams();
  const router = useRouter();
  const ruta = usePathname();
  const { f, setF } = useFiltrosUrl();
  const [q, setQ] = useState(params.get('q') || '');
  // el buscador de la barra superior (PC) cambia ?q sin recargar la vista
  useEffect(() => { const pq = params.get('q'); if (pq != null && pq !== q) setQ(pq); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params]);
  const [qLenta, setQLenta] = useState(q);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  useEffect(() => { const t = setTimeout(() => setQLenta(q), 120); return () => clearTimeout(t); }, [q]);
  // el texto pasa a la dirección (para compartir o volver) con una pequeña espera
  const irA = (texto: string) => { const p = paramsDeFiltros(f, { q: texto.trim() }); router.replace(`${ruta}${p.toString() ? '?' + p.toString() : ''}`, { scroll: false }); };
  useEffect(() => { const t = setTimeout(() => { if ((params.get('q') || '') !== q.trim()) irA(q); }, 400); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q]);
  const ubicador = useUbicador();
  const texto = qLenta.trim();
  const hayFiltros = cuentaFiltros(f) > 0;
  const ctx = useMemo<ContextoEntrada>(() => ({ precio: (c, a) => precios.precioDefecto(c, a).pen, donde: e => ubicador.donde(e), enVenta: e => !!col.publicacionDe(e.id) }), [precios, ubicador, col]);

  // En tu colección: copias que cumplen el texto y los filtros, agrupadas por carta (en orden de coincidencia)
  const propias = useMemo(() => {
    if (!texto && !hayFiltros) return [];
    const base = texto ? buscarColeccion(cat, col.entradas, texto).map(r => r.entry) : col.entradas;
    const m = new Map<string, Entrada[]>();
    for (const e of base) { if (!entradaCumple(cat, e, f, ctx)) continue; const k = e.carta_id || `p:${e.id}`; const l = m.get(k) || []; l.push(e); m.set(k, l); }
    return [...m.entries()].map(([k, entradas]) => ({ clave: k, carta: cat.carta(k), entradas }));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [cat, col.entradas, texto, f, ctx, precios.version]);
  const idsMias = useMemo(() => new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x)), [col.entradas]);
  // Otras cartas: del catálogo (por el texto), que cumplen los filtros de catálogo y no tengo
  const otras = useMemo(() => (texto ? buscarCatalogo(cat, texto, 120).map(r => r.card).filter(c => cartaCumple(c, f) && !idsMias.has(c.id)).slice(0, 40) : []), [cat, texto, f, idsMias]);
  usePedirPrecios(useMemo(() => propias.map(p => p.carta?.id).filter((x): x is string => !!x), [propias]));
  const [verMas, setVerMas] = useState(false);
  useEffect(() => { setVerMas(false); }, [texto, f]);
  const propiasVisibles = verMas ? propias : propias.slice(0, 60);
  const botones = (c: Carta) => (
    <div className="row acciones-resultado" style={{ marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
      <button className="btn sm primary" onClick={e => { e.stopPropagation(); setAgregar(c); }} data-testid="btn-guardar-fila"><Icono n="mas" tam={16} /> Agregar</button>
      <Link href={`/app/carta/${encodeURIComponent(c.id)}?desde=mercado#mercado`} className="btn sm" onClick={e => e.stopPropagation()} data-testid="btn-ver-mercado"><Icono n="tienda" tam={16} /> Ver en el mercado</Link>
    </div>
  );
  const totalPropias = propias.reduce((n, p) => n + p.entradas.reduce((m, e) => m + e.cantidad, 0), 0);
  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
        <Buscador className="search-wrap" value={q} onChange={setQ} onBuscar={irA} onElegir={s => { if (s.tipo === 'coleccion' && s.id) { setQ(''); setF({ ...f, coleccion: s.id }); } else if (s.tipo === 'ilustrador') { setQ(''); setF({ ...f, ilustrador: s.texto }); } else { setQ(s.texto); irA(s.texto); } }}
          placeholder="Nombre, número (025/165), colección, ilustrador…" limpiar inputTestid="buscar-coleccion-input" />
        <Link href="/app/escanear" className="btn" title="Identificar una carta con la cámara" data-testid="btn-escanear" style={{ flex: 'none' }}><Icono n="camara" /> Escanear</Link>
      </div>
      <QuisisteDecir q={q} onElegir={c => { setQ(c.consulta); irA(c.consulta); }} />
      <ConFiltros ambito="coleccion" f={f} onChange={setF} barra={texto || hayFiltros ? <span className="small muted" data-testid="resumen-busqueda">{totalPropias} {totalPropias === 1 ? 'carta tuya' : 'cartas tuyas'}{texto ? ` · ${otras.length} del catálogo` : ''}</span> : null}>
        {texto || hayFiltros ? (
          <div className="resultados-buscar" data-testid="resultados-buscar">
            <div className="bloque" data-testid="grupo-propias">
              <h3><span>En tu colección</span><span className="count">{totalPropias} {totalPropias === 1 ? 'carta' : 'cartas'}{propias.length !== totalPropias ? ` · ${propias.length} distintas` : ''}</span></h3>
              {!propias.length ? <p className="small muted">{texto ? 'Ninguna carta de tu colección coincide.' : 'Ninguna carta de tu colección cumple esos filtros.'}</p> : null}
              <div className="card-list">
                {propiasVisibles.map(p => p.carta ? (
                  <CardRow key={p.clave} carta={p.carta} entradas={p.entradas} ubicador={ubicador} locCompleta extra={botones(p.carta)} />
                ) : (
                  <div className="card-row" key={p.clave} style={{ cursor: 'default' }}>
                    <div className="thumb" />
                    <div className="card-main"><div className="card-name">{p.entradas[0].personalizada?.nombre}</div><div className="card-set">{p.entradas[0].personalizada?.coleccion} <span className="num">{p.entradas[0].personalizada?.numero}</span> <span className="pill">personalizada</span> ×{p.entradas[0].cantidad}</div><div className="small" style={{ marginTop: 3 }}><LocChip loc={ubicador.donde(p.entradas[0])} /></div></div>
                  </div>
                ))}
              </div>
              {propias.length > propiasVisibles.length ? <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setVerMas(true)}>Ver las {propias.length - propiasVisibles.length} restantes</button> : null}
            </div>
            {texto ? (
              <div className="bloque" data-testid="grupo-otras">
                <h3><span>Otras cartas</span><span className="count">del catálogo</span></h3>
                {!otras.length ? <p className="small muted">{propias.length ? 'No hay más cartas con ese nombre en el catálogo.' : 'No encontré esa carta. Prueba con el nombre en inglés, el número con el total (025/165) o el código de la colección.'}</p> : null}
                <div className="card-list">
                  {otras.map(c => <CardRow key={c.id} carta={c} entradas={[]} ubicador={ubicador} locCompleta extra={botones(c)} />)}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <MiColeccion onAgregar={c => setAgregar(c)} />
        )}
      </ConFiltros>
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
        <div className="big"><Icono n="bulk" tam={44} grosor={1.5} /></div>
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
        <div className="box"><b>{total.toLocaleString('es-PE')}</b><span>cartas · {col.entradas.length} distintas</span></div>
        <div className="box" title={`Suma del precio por defecto (el mayor entre el piso y el precio de mercado) por la cantidad de cada carta. ${valor.conMercado} con precio de mercado.`} data-con-mercado={valor.conMercado}><b>{precios.version === 0 && precios.cargando ? '…' : fmtPen(valor.pen)}</b><span>precio estimado{precios.cargando ? ' · actualizando…' : ''}</span></div>
        <div className="box"><b>{col.cajas.length}</b><span>{col.cajas.length === 1 ? 'Bulk' : 'Bulks'}</span></div>
      </div>
      <FilterBar f={f} onChange={setF} langs={langs} />
      {grupos.map(g => {
        const abierto = abiertos[g.key] ?? (grupos.length <= 12 || g.entradas.length <= 30);
        const cartas = ordenarCartas(cat, g.cartas, f.sort, idioma, { addedAt, priceOf });
        const unidades = totalCartas(g.entradas);
        return (
          <div className="bloque" key={g.key}>
            <h3 style={{ cursor: 'pointer' }} onClick={() => setAbiertos(a => ({ ...a, [g.key]: !abierto }))}>
              <span><Icono n={abierto ? 'abajo' : 'derecha'} tam={16} /> {g.set ? <SimboloSet setId={g.set.id} /> : null} {g.nombre}</span>
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
