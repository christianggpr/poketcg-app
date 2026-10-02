'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { nombreAlt, nombreCarta, nombreColeccion, numLabel, rarezaLabel, type Carta } from '@/lib/catalogo';
import { buscarCatalogo } from '@/lib/buscar';
import { ORDENES_MERCADO, POR_PAGINA_MERCADO, TOPE_MERCADO, cartaCumple, cuentaFiltros, esOrdenMercado, esVistaMercado, paginaDeParams, paramsDeFiltros, type Filtros, type OrdenMercado, type VistaMercado } from '@/lib/filtros';
import { mercadoSinFiltrosNuevos, resumenMercado, type ResumenCarta } from '@/lib/mercado';
import { ConFiltros, useFiltrosUrl } from '../Filtros';
import { Buscador, QuisisteDecir } from '../Buscador';
import { BotonCamara } from '../Barras';
import { Ayuda } from '../Ayuda';
import { fmtPen } from '@/lib/precios-core';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { usePedirPrecios } from '../Precio';
import { SimboloSet } from '../CardRow';
import { Thumb } from '../Thumb';
import { Aviso, useEsPC } from '../ui';
import { DestacadosMercado } from './MercadoInicio';

/**
 * Mercado → Explorar (Mejoras 5 · C, maquetas M5-PC-Mercado / M5-Mercado): como un catálogo. PC: columna izquierda con el
 * buscador (con cámara), "¿Quisiste decir…?" y la tarjeta Filtros (Estado en botones, punto de entrega, Aplicar filtros,
 * Limpiar; plegable); derecha: título, "[N] cartas en venta · página X de Y", Ordenar, cuadrícula/lista, chips quitables,
 * cuadrícula de 5 por fila (4 a 1280 px) y paginación. Celular: buscador + "Filtros · N" (hoja con Limpiar y "Ver N cartas")
 * y cuadrícula de 2. Todo (texto, filtros, orden, vista y página) vive en la dirección para compartir o volver.
 */
export function Mercado() {
  const cat = useCatalogo();
  const col = useColeccion();
  const mercado = useMercado();
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const { f, setF } = useFiltrosUrl();
  const esPC = useEsPC();
  const [q, setQ] = useState(params.get('q') || '');
  // el buscador de la barra superior (PC) cambia ?q sin recargar la vista
  useEffect(() => { const pq = params.get('q'); if (pq != null && pq !== q) setQ(pq); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params]);
  const orden: OrdenMercado = esOrdenMercado(params.get('orden')) ? (params.get('orden') as OrdenMercado) : 'novedad';
  const vista: VistaMercado = esVistaMercado(params.get('vista')) ? (params.get('vista') as VistaMercado) : 'cuadricula';
  const pagina = paginaDeParams(params);
  const soloFaltan = params.get('faltan') === '1';
  const [filas, setFilas] = useState<ResumenCarta[] | null>(null);
  const [error, setError] = useState('');
  const pedido = useRef(0);
  // la dirección lleva q, orden, faltan, vista, página y los filtros (para compartir o volver)
  const irA = (cambios: { q?: string; orden?: OrdenMercado; faltan?: boolean; f?: Filtros; vista?: VistaMercado; pagina?: number }) => {
    const nuevaVista = cambios.vista ?? vista;
    const nuevaPagina = cambios.pagina ?? 1;   // cualquier otro cambio vuelve a la página 1
    const p = paramsDeFiltros(cambios.f ?? f, { q: (cambios.q ?? q).trim(), orden: (cambios.orden ?? orden) === 'novedad' ? '' : (cambios.orden ?? orden), faltan: (cambios.faltan ?? soloFaltan) ? '1' : '', vista: nuevaVista === 'cuadricula' ? '' : nuevaVista, pagina: nuevaPagina > 1 ? String(nuevaPagina) : '' });
    router.replace(`${ruta}${p.toString() ? '?' + p.toString() : ''}`, { scroll: false });
  };
  // el texto escrito pasa a la dirección con una pequeña espera
  useEffect(() => { const t = setTimeout(() => { if ((params.get('q') || '') !== q.trim()) irA({ q }); }, 400); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q]);

  // ids de cartas que coinciden con el texto (nombre ES/EN/JP, número y colección: lo hace el catálogo en el navegador)
  const idsTexto = useMemo(() => { const t = q.trim(); return t ? buscarCatalogo(cat, t, 400).map(r => r.card.id) : null; }, [cat, q]);
  // si la base aún no tiene 0009, los filtros de catálogo (tipo, rareza, ilustrador) se aplican aquí con la lista de ids
  const idsFiltro = useMemo(() => {
    if (!mercadoSinFiltrosNuevos() || !(f.tipo || f.rareza || f.ilustrador)) return idsTexto;
    const base = idsTexto ? idsTexto.map(id => cat.carta(id)).filter((c): c is Carta => !!c) : cat.cards;
    return base.filter(c => cartaCumple(c, f)).map(c => c.id).slice(0, 2000);
  }, [idsTexto, f, cat]);
  const idsMias = useMemo(() => new Set(col.entradas.map(e => e.carta_id).filter((x): x is string => !!x)), [col.entradas]);

  // se traen hasta TOPE_MERCADO cartas distintas y la paginación se hace aquí (así se sabe "N cartas en venta · página X de Y")
  const claveFiltros = JSON.stringify(f);
  useEffect(() => {
    if (idsFiltro && !idsFiltro.length) { setFilas([]); return; }
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      try {
        const r = await resumenMercado({ cartas: idsFiltro, set: f.coleccion, idioma: f.idioma, acabado: f.acabado, condicion: f.condicion, min: f.min, max: f.max, tipo: f.tipo, rareza: f.rareza, ilustrador: f.ilustrador, foto: f.foto, reputacion: f.reputacion, orden, limite: TOPE_MERCADO, desde: 0 });
        if (n !== pedido.current) return;
        setFilas(r);
        setError('');
      } catch (e) { if (n === pedido.current) setError((e as Error).message); }
    }, 250);
    return () => clearTimeout(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [idsFiltro, claveFiltros, orden, mercado.version]);

  const lista = useMemo(() => (filas || []).filter(x => !soloFaltan || !idsMias.has(x.carta_id)), [filas, soloFaltan, idsMias]);
  const total = filas ? lista.length : null;
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA_MERCADO));
  const paginaActual = Math.min(pagina, paginas);
  const visibles = lista.slice((paginaActual - 1) * POR_PAGINA_MERCADO, paginaActual * POR_PAGINA_MERCADO);
  usePedirPrecios(useMemo(() => visibles.map(x => x.carta_id), [visibles]));
  const hayAlgo = !!(q || cuentaFiltros(f) || soloFaltan);
  // Mejoras 5 · D: sin búsqueda, filtros, orden ni página, Explorar es el inicio del Mercado: destacados arriba de la cuadrícula
  const enInicio = !hayAlgo && orden === 'novedad' && paginaActual === 1;
  const sinNuevos = mercadoSinFiltrosNuevos() && (f.foto || f.reputacion || orden === 'ventas' || orden === 'nombre');
  const cambiarPagina = (p: number) => { irA({ pagina: Math.max(1, Math.min(paginas, p)) }); document.querySelector('[data-testid=resultados-mercado]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  const busqueda = (
    <div className="busqueda-explorar">
      <Buscador value={q} onChange={setQ} onBuscar={t => irA({ q: t })} onElegir={s => { if (s.tipo === 'coleccion' && s.id) { setQ(''); irA({ q: '', f: { ...f, coleccion: s.id } }); } else if (s.tipo === 'ilustrador') { setQ(''); irA({ q: '', f: { ...f, ilustrador: s.texto } }); } else irA({ q: s.texto }); }}
        placeholder={esPC ? 'Buscar carta, colección…' : 'Buscar carta…'} aria-label="Buscar en el mercado" className="con-camara" limpiar derecha={<BotonCamara />} inputTestid="buscar-mercado" />
      <QuisisteDecir q={q} onElegir={c => { setQ(c.consulta); irA({ q: c.consulta }); }} />
    </div>
  );
  const cabecera = (
    <div className="cabecera-explorar" data-testid="cabecera-explorar">
      <div className="grow">
        <h1 className="titulo-con-ayuda">Explorar <Ayuda texto="Cartas que otros coleccionistas tienen en venta. El precio que ves es el que pagas por copia (la comisión la paga el vendedor): pagas por Yape/Plin o con tu saldo y recoges en una tienda aliada con tu código de retiro. Las copias del carrito quedan reservadas 24 h." /></h1>
        <div className="small muted" data-testid="cuenta-explorar">{total == null ? 'Consultando el mercado…' : <>{total.toLocaleString('es-PE')}{filas && filas.length >= TOPE_MERCADO ? '+' : ''} {total === 1 ? 'carta en venta' : 'cartas en venta'}{q.trim() ? <> para «{q.trim()}»</> : null} · página {paginaActual} de {paginas}</>}</div>
      </div>
      <div className="herramientas-explorar">
        <label className="small muted" htmlFor="orden-mercado">Ordenar</label>
        <select id="orden-mercado" className="input sm selector-orden" value={orden} onChange={e => irA({ orden: e.target.value as OrdenMercado })} aria-label="Ordenar" data-testid="orden-mercado">
          {ORDENES_MERCADO.map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </select>
        <div className="seg vista-explorar" role="group" aria-label="Vista" data-testid="vista-explorar">
          <button type="button" className={vista === 'cuadricula' ? 'active' : ''} aria-pressed={vista === 'cuadricula'} onClick={() => irA({ vista: 'cuadricula', pagina: paginaActual })} aria-label="Vista en cuadrícula" title="Cuadrícula" data-testid="vista-cuadricula"><Icono n="cuadricula" tam={18} /></button>
          <button type="button" className={vista === 'lista' ? 'active' : ''} aria-pressed={vista === 'lista'} onClick={() => irA({ vista: 'lista', pagina: paginaActual })} aria-label="Vista en lista" title="Lista" data-testid="vista-lista"><Icono n="lista" tam={18} /></button>
        </div>
        <label className="check small faltan-check"><input type="checkbox" checked={soloFaltan} onChange={e => irA({ faltan: e.target.checked })} data-testid="solo-faltan" /> Solo las que me faltan</label>
        <Link href="/app/carrito" className="btn sm" data-testid="btn-carrito"><Icono n="carrito" /> Carrito{mercado.unidades ? ` (${mercado.unidades})` : ''}</Link>
      </div>
    </div>
  );
  const paginacion = filas && paginas > 1 ? (
    <nav className="paginacion" aria-label="Páginas" data-testid="paginacion-mercado">
      <button type="button" className="btn sm" disabled={paginaActual <= 1} onClick={() => cambiarPagina(paginaActual - 1)} data-testid="pagina-anterior-mercado"><Icono n="izquierda" tam={18} /> Anterior</button>
      <span className="small muted">Página {paginaActual} de {paginas}</span>
      <button type="button" className="btn sm" disabled={paginaActual >= paginas} onClick={() => cambiarPagina(paginaActual + 1)} data-testid="pagina-siguiente-mercado">Siguiente <Icono n="derecha" tam={18} /></button>
    </nav>
  ) : null;
  return (
    <div className="mercado-buscar explorar">
      <ConFiltros ambito="mercado" f={f} onChange={setF} busqueda={busqueda} barra={cabecera} aplicar total={total} unidad="cartas" columna={esPC ? <ListaDeseos /> : null} ancho="ancha">
        {enInicio ? <DestacadosMercado /> : null}
        {!esPC ? <ListaDeseos /> : null}
        {sinNuevos ? <Aviso tipo="warn">Para filtrar por foto real o reputación y ordenar por más vendidas o nombre hay que pegar <code>0009_mejoras4.sql</code> en Supabase. Mientras tanto se muestra sin esos filtros.</Aviso> : null}
        {error ? <Aviso tipo="danger">No se pudo consultar el mercado: {error}</Aviso> : null}
        {filas === null && !error ? <p className="muted small" style={{ marginTop: 12 }}><span className="spinner" /> Consultando el mercado…</p> : null}
        {filas && !lista.length ? (
          <div className="empty"><div className="big"><Icono n="buscar" tam={44} grosor={1.5} /></div><p><b>{hayAlgo ? 'Nada en venta con esos filtros.' : 'Todavía no hay cartas en venta.'}</b></p><p className="muted">{hayAlgo ? 'Prueba quitando algún filtro o revisa cómo escribiste el nombre.' : 'Cuando alguien publique una carta aparecerá aquí al instante. ¿Tienes repetidas? Ponlas en venta desde tus cajas.'}</p></div>
        ) : null}
        <div className={vista === 'lista' ? 'card-list' : 'cuadricula-mercado'} style={{ marginTop: 10 }} data-testid="resultados-mercado" data-vista={vista}>
          {visibles.map(x => {
            const c = cat.carta(x.carta_id);
            if (!c) return null;
            const abrir = () => router.push(`/app/carta/${encodeURIComponent(c.id)}?desde=mercado#mercado`);
            return vista === 'lista' ? <FilaMercado key={x.carta_id} carta={c} resumen={x} tengo={idsMias.has(x.carta_id)} onClick={abrir} /> : <TarjetaMercado key={x.carta_id} carta={c} resumen={x} tengo={idsMias.has(x.carta_id)} onClick={abrir} />;
          })}
        </div>
        {paginacion}
      </ConFiltros>
    </div>
  );
}

/** Tarjeta de la cuadrícula (maqueta M5-PC-Mercado): imagen, colección y número, nombre, copias y vendedor, precio más bajo, "Mercado: S/ X" y corazón. */
export function TarjetaMercado({ carta, resumen, tengo, onClick }: { carta: Carta; resumen: ResumenCarta; tengo: boolean; onClick: () => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const mercado = useMercado();
  const idioma = perfil.idioma_nombres;
  const set = cat.setOf(carta);
  const favorita = mercado.favoritos.includes(carta.id);
  const referencia = carta.sd ? null : precios.precioDefecto(carta, '');
  return (
    <div className="tarjeta-mercado" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }} data-testid="fila-mercado" data-carta={carta.id}>
      <button type="button" className={`btn icon sm corazon ${favorita ? 'activa' : ''}`} onClick={e => { e.stopPropagation(); mercado.alternarFavorita(carta.id).catch(() => {}); }} aria-pressed={favorita} aria-label={favorita ? 'Quitar de mi lista de deseos' : 'Agregar a mi lista de deseos'} title={favorita ? 'En tu lista de deseos' : 'Agregar a la lista de deseos'} data-testid="btn-favorita-tarjeta"><Icono n="corazon" tam={18} relleno={favorita} /></button>
      <Thumb carta={carta} set={set} className="lg" alt={nombreCarta(carta, idioma)} />
      <span className="set small muted"><SimboloSet setId={carta.s} /> {set?.ab || nombreColeccion(set, idioma, true)} · {numLabel(carta, set)}</span>
      <span className="nombre">{nombreCarta(carta, idioma)}{tengo ? <span className="pill primary" style={{ marginLeft: 6 }}>la tengo</span> : null}</span>
      <span className="small muted copias">{set?.rg === 'ja' ? 'JP · ' : ''}{resumen.copias} {resumen.copias === 1 ? 'copia' : 'copias'} · {resumen.vendedores.slice(0, 1).map(v => '@' + v).join('')}{resumen.vendedores.length > 1 ? ` +${resumen.vendedores.length - 1}` : ''}</span>
      <span className="price">{resumen.precio_min === resumen.precio_max ? fmtPen(resumen.precio_min) : `desde ${fmtPen(resumen.precio_min)}`}</span>
      {referencia ? <span className="small muted referencia">Mercado: {fmtPen(referencia.pen)}</span> : null}
    </div>
  );
}

/** Lista de deseos: las cartas marcadas con el corazón, con la mejor oferta actual o "sin ofertas" (la app avisa cuando aparece una). */
export function ListaDeseos({ abiertaAlInicio = false }: { abiertaAlInicio?: boolean }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const router = useRouter();
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const [resumen, setResumen] = useState<Map<string, ResumenCarta>>(new Map());
  const ids = mercado.favoritos;
  useEffect(() => {
    if (!ids.length || !abierta) return;
    resumenMercado({ cartas: ids, limite: 200 }).then(r => setResumen(new Map(r.map(x => [x.carta_id, x])))).catch(() => {});
  }, [ids, abierta, mercado.version]);
  if (!ids.length) return null;
  const enVenta = ids.filter(id => resumen.has(id)).length;
  return (
    <div className="panel" style={{ marginTop: 8, padding: '8px 12px' }} data-testid="lista-deseos">
      <button className="link" style={{ fontWeight: 700 }} onClick={() => setAbierta(a => !a)} data-testid="btn-lista-deseos"><Icono n="corazon" /> Mi lista de deseos ({ids.length}){abierta && enVenta ? ` · ${enVenta} en venta` : ''} <Icono n={abierta ? 'arriba' : 'abajo'} /></button>
      {abierta ? (
        <div className="card-list" style={{ marginTop: 6 }}>
          {ids.map(id => { const c = cat.carta(id); if (!c) return null; const r = resumen.get(id); const set = cat.setOf(c); return (
            <div key={id} className="card-row" role="button" tabIndex={0} onClick={() => router.push(`/app/carta/${encodeURIComponent(id)}?desde=mercado#mercado`)} data-testid="fila-deseo">
              <Thumb carta={c} set={set} />
              <div className="card-main">
                <div className="card-name">{nombreCarta(c, perfil.idioma_nombres)}</div>
                <div className="card-set"><SimboloSet setId={c.s} /> {nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(c, set)}</span></div>
                <div className="small" style={{ marginTop: 3 }}>{r ? <><b>{r.copias} {r.copias === 1 ? 'copia' : 'copias'}</b> en venta · {r.vendedores.map(v => '@' + v).join(', ')}</> : <span className="muted">Sin ofertas por ahora: te avisamos cuando alguien la publique.</span>}</div>
              </div>
              <div className="card-side"><span className="price">{r ? (r.precio_min === r.precio_max ? fmtPen(r.precio_min) : `desde ${fmtPen(r.precio_min)}`) : '—'}</span><button className="btn sm ghost" style={{ marginTop: 4 }} onClick={e => { e.stopPropagation(); mercado.alternarFavorita(id).catch(() => {}); }} title="Quitar de la lista" aria-label="Quitar de la lista" data-testid="btn-quitar-deseo"><Icono n="cerrar" /></button></div>
            </div>
          ); })}
        </div>
      ) : null}
    </div>
  );
}

export function FilaMercado({ carta, resumen, tengo, onClick }: { carta: Carta; resumen: ResumenCarta; tengo: boolean; onClick: () => void }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const idioma = perfil.idioma_nombres;
  const set = cat.setOf(carta);
  const alt = nombreAlt(carta, idioma);
  return (
    <div className="card-row" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }} data-testid="fila-mercado" data-carta={carta.id}>
      <Thumb carta={carta} set={set} />
      <div className="card-main">
        <div className="card-name">{nombreCarta(carta, idioma)}{alt ? <span className="alt"> · {alt}</span> : null}{tengo ? <span className="pill primary" style={{ marginLeft: 6 }}>la tengo</span> : null}</div>
        <div className="card-set"><SimboloSet setId={carta.s} /> {nombreColeccion(set, idioma)} <span className="num">{numLabel(carta, set)}</span>{carta.r ? <span className="faint"> · {rarezaLabel(carta.r)}</span> : null}</div>
        <div className="small" style={{ marginTop: 3 }}><b>{resumen.copias} {resumen.copias === 1 ? 'copia' : 'copias'}</b> en la red · {resumen.vendedores.map(v => '@' + v).join(', ')}{resumen.ofertas > resumen.vendedores.length ? '…' : ''}</div>
      </div>
      <div className="card-side"><span className="price">{resumen.precio_min === resumen.precio_max ? fmtPen(resumen.precio_min) : `desde ${fmtPen(resumen.precio_min)}`}</span></div>
    </div>
  );
}
