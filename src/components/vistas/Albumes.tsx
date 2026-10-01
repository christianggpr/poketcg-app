'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Carta, Coleccion } from '@/lib/catalogo';
import { idiomaImagen, nombreCarta, nombreColeccion, urlsImagen } from '@/lib/catalogo';
import type { Entrada } from '@/lib/coleccion';
import { fmtPen } from '@/lib/precios-core';
import { IDIOMAS_CARTA } from '@/lib/config';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { usePerfil } from '../PerfilProvider';
import { usePrecios } from '../PreciosProvider';
import { useUbicador } from '../useUbicador';
import { Thumb } from '../Thumb';
import { LocChip } from '../Ubicacion';
import { usePedirPrecios } from '../Precio';
import { Confirmar } from '../Sheet';
import { useMercado } from '../MercadoProvider';
import { resumenMercado, type ResumenCarta } from '@/lib/mercado';
import { AddEntrySheet } from '../AddEntrySheet';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { PorLlegar, Recibidas } from './PorLlegar';
import { AvisosOrdenar, LlenarAlbumesSheet, OrdenarRepetidasSheet, useOrdenar } from './Repetidas';
import { PonerEnVentaSheet } from './VentaAlbum';
import { Libro, type AccionLibro } from '../Libro';
import { EditorAlbumPropio } from '../EditorAlbumPropio';
import { PortadaColeccion, PortadaPropia } from '../Portadas';
import { AgregarRapidoSheet } from '../AgregarRapidoSheet';
import { TarjetaPokedex, useOcultarPokedex } from './Pokedex';

/** Idioma de una entrada para agrupar álbumes: JP para colecciones japonesas, el registrado o "—". */
function idiomaAlbum(e: Entrada, set: Coleccion | undefined): string {
  if (set?.rg === 'ja') return 'JP';
  return e.idioma || '—';
}

type AlbumAuto = { set: Coleccion; idioma: string; entradas: Entrada[]; distintas: number; total: number };

function useAlbumesAuto(): AlbumAuto[] {
  const cat = useCatalogo();
  const col = useColeccion();
  return useMemo(() => {
    const m = new Map<string, AlbumAuto>();
    for (const e of col.entradas) {
      const c = cat.carta(e.carta_id);
      if (!c) continue;
      const set = cat.setOf(c);
      if (!set) continue;
      const idioma = idiomaAlbum(e, set);
      const key = set.id + '|' + idioma;
      let a = m.get(key);
      if (!a) { a = { set, idioma, entradas: [], distintas: 0, total: cat.cartasDe(set.id).filter(c => !c.sd).length }; m.set(key, a); }
      a.entradas.push(e);
    }
    for (const a of m.values()) a.distintas = new Set(a.entradas.map(e => e.carta_id)).size;
    return [...m.values()].sort((a, b) => (b.set.d || '').localeCompare(a.set.d || '') || a.idioma.localeCompare(b.idioma));
  }, [cat, col.entradas]);
}

export function Albumes() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const toast = useToast();
  const router = useRouter();
  const albumes = useAlbumesAuto();
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'coleccion' | 'propios'>('todos');
  const idioma = perfil.idioma_nombres;
  // precio de cada álbum: Σ precio por defecto × cantidad de sus cartas (los precios ya se piden para toda la colección)
  const precioDe = (entradas: Entrada[]) => { let t = 0; for (const e of entradas) { const c = cat.carta(e.carta_id); if (c && !c.sd) t += precios.precioDefecto(c, e.acabado).pen * e.cantidad; } return t; };
  const propios = col.albumes.map(a => {
    const cas = col.casillas.filter(c => c.album_id === a.id);
    const entradas = cas.map(c => col.entradas.find(e => e.id === c.entrada_id)).filter((e): e is Entrada => !!e);
    const capacidad = a.paginas * a.columnas * a.filas;
    return { album: a, cartas: entradas.reduce((n, e) => n + e.cantidad, 0), asignadas: cas.filter(c => c.carta_id || c.entrada_id).length, capacidad, precio: precioDe(entradas) };
  });
  const verColeccion = filtro !== 'propios', verPropios = filtro !== 'coleccion';
  const vacio = !albumes.length && !col.albumes.length;
  // Mejoras 4 · C: la Pokédex (álbum virtual por especie) va primera, salvo que el usuario la haya ocultado
  const ocultarPokedex = useOcultarPokedex();
  const pokedexOculta = !!perfil.pokedex_oculto;
  return (
    <div>
      <div className="solo-celular"><PorLlegar /></div>
      <Recibidas />
      <AvisosOrdenar />
      <div className="cabecera-seccion">
        <h2 style={{ margin: 0 }}>Mis álbumes</h2>
        <div className="acciones">
          <div className="seg solo-pc" data-testid="filtro-albumes">
            <button className={filtro === 'todos' ? 'active' : ''} onClick={() => setFiltro('todos')}>Todos</button>
            <button className={filtro === 'coleccion' ? 'active' : ''} onClick={() => setFiltro('coleccion')}>Por colección</button>
            <button className={filtro === 'propios' ? 'active' : ''} onClick={() => setFiltro('propios')}>Propios</button>
          </div>
          <button className="btn primary sm" onClick={() => setNuevo(true)} data-testid="btn-nuevo-album"><Icono n="mas" /> Nuevo álbum</button>
        </div>
      </div>
      {vacio ? <div className="empty"><div className="big"><Icono n="album" tam={44} grosor={1.5} /></div><p><b>Todavía no tienes álbumes.</b></p><p className="muted">Los álbumes por colección se crean solos cuando guardas cartas (uno por colección e idioma). Un álbum propio es una carpeta con páginas de bolsillos (por ejemplo 3 × 3) a la que asignas las cartas que van en cada bolsillo.</p></div> : null}
      <div className="album-grid">
        {verColeccion && !pokedexOculta ? <TarjetaPokedex /> : null}
        {verColeccion ? albumes.map(a => {
          const pct = a.total ? Math.round((a.distintas / a.total) * 100) : 0;
          return (
            <Link key={a.set.id + a.idioma} href={`/app/album/${encodeURIComponent(a.set.id)}?idioma=${encodeURIComponent(a.idioma)}`} className="album-card" data-testid="album-coleccion">
              <PortadaColeccion set={a.set} />
              <div className="album-body">
                <div className="album-title"><span className="nombre">{nombreColeccion(a.set, idioma)}</span>{a.idioma === '—' ? <span className="pill" title="Cartas registradas sin idioma">sin idioma</span> : <span className={`pill ${a.idioma === 'JP' ? 'jp' : 'info'}`}>{a.idioma}</span>}</div>
                <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
                <div className="album-foot-card"><span>{a.distintas} / {a.total}</span><span>{fmtPen(precioDe(a.entradas))}</span></div>
              </div>
            </Link>
          );
        }) : null}
        {verPropios ? propios.map(({ album: a, cartas, asignadas, capacidad, precio }) => (
          <Link key={a.id} href={`/app/album/p/${a.id}`} className="album-card" data-testid="album-propio">
            <PortadaPropia nombre={a.nombre} color={a.color} marca={a.marca_agua} />
            <div className="album-body">
              <div className="album-title"><span className="nombre">{a.nombre}</span><span className="pill warn">Propio</span></div>
              <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={capacidad ? Math.round((asignadas / capacidad) * 100) : 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: (capacidad ? Math.round((asignadas / capacidad) * 100) : 0) + '%' }} /></div>
              <div className="album-foot-card"><span>{cartas} {cartas === 1 ? 'carta' : 'cartas'}</span><span>{fmtPen(precio)}</span></div>
            </div>
          </Link>
        )) : null}
      </div>
      {verColeccion && pokedexOculta ? <p className="small muted" style={{ marginTop: 10 }}>La Pokédex está oculta. <button type="button" className="link" onClick={() => ocultarPokedex(false)} data-testid="btn-mostrar-pokedex">Mostrar la Pokédex</button></p> : null}
      {nuevo ? (
        <EditorAlbumPropio titulo="Nuevo álbum personalizado" okLabel="Crear álbum" onClose={() => setNuevo(false)}
          onGuardar={async d => { const a = await col.crearAlbum(d); if (a) { toast('Álbum creado', 'ok'); router.push(`/app/album/p/${a.id}`); } return !!a; }} />
      ) : null}
    </div>
  );
}

/**
 * Álbum de una colección (en un idioma) como libro (Mejoras 4 · A: componente `Libro`, que ocupa casi toda la pantalla).
 * La cuadrícula se elige (3×3, 3×4, 4×4, 4×5, 4×6; en el celular 3×3, 3×4 y 4×5) y en PC se ven 1 o 2 páginas lado a lado;
 * la elección se recuerda por usuario y por álbum. Progreso y precio van en una fila compacta; los botones, en el menú Acciones.
 */
export function AlbumColeccion({ setId }: { setId: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const params = useSearchParams();
  const router = useRouter();
  const idiomaAlb = params.get('idioma') || '';
  const [modo, setModo] = useState<'todas' | 'tengo' | 'faltan'>('todas');
  const [pagina, setPagina] = useState(1);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  // Mejoras 3 · C: casilla abierta en "agregar rápido" (el botón + de una casilla gris)
  const [rapido, setRapido] = useState<Carta | null>(null);
  const [consultarFaltan, setConsultarFaltan] = useState(false);
  const [idiomaNuevo, setIdiomaNuevo] = useState('ES');
  const [asignando, setAsignando] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
  const [asistente, setAsistente] = useState<'repetidas' | 'llenar' | null>(null);
  const ordenar = useOrdenar(setId);
  const [enRed, setEnRed] = useState<Map<string, ResumenCarta>>(new Map());
  const mercado = useMercado();
  const toast = useToast();
  const set = cat.coleccion(setId);
  // Fase 2 · C: qué cartas de esta colección están en venta en la red (se actualiza en tiempo real)
  useEffect(() => {
    if (!set) return;
    let vivo = true;
    resumenMercado({ set: set.id, limite: 500, orden: 'precio' }).then(r => { if (vivo) setEnRed(new Map(r.map(x => [x.carta_id, x]))); }).catch(() => {});
    return () => { vivo = false; };
  }, [set, mercado.version]);
  const idioma = perfil.idioma_nombres;
  const cartas = useMemo(() => (set ? cat.cartasDe(set.id) : []), [cat, set]);
  const propias = useMemo(() => {
    const m = new Map<string, Entrada[]>();
    for (const e of col.entradas) {
      if (!e.carta_id || !set) continue;
      const c = cat.carta(e.carta_id);
      if (!c || c.s !== set.id) continue;
      if (idiomaAlb && idiomaAlbum(e, set) !== idiomaAlb) continue;
      const l = m.get(e.carta_id) || []; l.push(e); m.set(e.carta_id, l);
    }
    return m;
  }, [col.entradas, cat, set, idiomaAlb]);
  const idsPropias = useMemo(() => [...propias.keys()], [propias]);
  const idsFaltan = useMemo(() => cartas.filter(c => !propias.has(c.id) && !c.sd).map(c => c.id), [cartas, propias]);
  usePedirPrecios(consultarFaltan ? [...idsPropias, ...idsFaltan] : idsPropias);

  const stats = useMemo(() => {
    let valor = 0, faltaPen = 0, faltaConPrecio = 0;
    for (const [id, es] of propias) { const c = cat.carta(id); if (!c || c.sd) continue; for (const e of es) valor += precios.precioDefecto(c, e.acabado).pen * e.cantidad; }
    for (const id of idsFaltan) { const c = cat.carta(id); if (!c) continue; const d = precios.precioDefecto(c, ''); faltaPen += d.pen; if (d.mercado) faltaConPrecio++; }
    return { valor: Math.round(valor * 100) / 100, faltaPen: Math.round(faltaPen * 100) / 100, faltaConPrecio };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [propias, idsFaltan, cat, precios.version]);
  const lista = useMemo(() => modo === 'tengo' ? cartas.filter(c => propias.has(c.id)) : modo === 'faltan' ? cartas.filter(c => !propias.has(c.id)) : cartas, [cartas, propias, modo]);
  useEffect(() => { setPagina(1); }, [modo]);
  // Mejoras 2 · A: se precargan en segundo plano las imágenes de la página siguiente (la hoja pasa sin esperar)
  const precargar = (siguientes: Carta[]) => { if (!set) return; for (const c of siguientes) { const u = urlsImagen(c, set, idiomaImagen(idiomaAlb))[0]; if (u) { const im = new Image(); im.decoding = 'async'; im.src = u; } } };

  if (!set) return <div className="empty">Esa colección no existe. <Link href="/app/album">Volver</Link></div>;
  const sinIdioma = idiomaAlb === '—' ? [...propias.values()].flat() : [];
  async function asignarIdioma() {
    setAsignando(true);
    const n = await col.editarVarias(sinIdioma.map(e => e.id), { idioma: idiomaNuevo });
    setAsignando(false);
    toast(`${n} ${n === 1 ? 'carta marcada' : 'cartas marcadas'} como ${idiomaNuevo}`, 'ok');
    router.replace(`/app/album/${encodeURIComponent(set!.id)}?idioma=${encodeURIComponent(idiomaNuevo)}`);
  }
  const sinPublicar = [...propias.values()].flat().filter(e => !col.publicacionDe(e.id));
  const total = cartas.filter(c => !c.sd).length;
  const pct = total ? Math.round((idsPropias.length / total) * 100) : 0;
  const enVentaFaltan = idsFaltan.filter(id => enRed.has(id)).length;
  // Mejoras 3 · C: la siguiente casilla vacía del álbum después de `c` (si no hay, la primera vacía anterior)
  const siguienteVacia = (c: Carta): Carta | null => {
    const vacias = cartas.filter(x => !propias.has(x.id) && !x.sd && x.id !== c.id);
    if (!vacias.length) return null;
    const i = cartas.indexOf(c);
    return vacias.find(x => cartas.indexOf(x) > i) || vacias[0];
  };
  const celda = (c: Carta) => {
    const es = propias.get(c.id) || [];
    const qty = es.reduce((n, e) => n + e.cantidad, 0);
    // Mejoras 2 · B: la casilla guarda 1 copia; las copias de más en la casilla son repetidas (asistente) y las del Bulk se cuentan aparte
    const enCasilla = es.filter(e => e.album_coleccion === set.id).reduce((n, e) => n + e.cantidad, 0);
    const otras = qty - enCasilla;
    const red = enRed.get(c.id);
    const pubs = es.filter(e => e.album_coleccion === set.id).map(e => col.publicacionDe(e.id)).filter((p): p is NonNullable<typeof p> => !!p && (p.estado === 'activa' || p.estado === 'pausada'));
    const enVenta = pubs.length > 0;
    // Mejoras 2 · C: copias de la casilla puestas a la venta ("en el álbum, para vender")
    const paraVender = pubs.reduce((n, p) => n + p.cantidad, 0);
    const titulo = `${nombreCarta(c, idioma)} · ${c.l}${qty ? ` · tienes ${qty}${enCasilla > 1 ? ` (${enCasilla - 1} repetidas en la casilla)` : ''}${otras ? ` (${otras} en Bulk)` : ''}${paraVender ? ` · ${paraVender} en el álbum, para vender` : ''}` : red ? ` · en el mercado desde ${fmtPen(red.precio_min)}` : ' · te falta'}`;
    if (qty) {
      return (
        <Link href={`/app/carta/${encodeURIComponent(c.id)}`} className="pocket filled album-cell" title={titulo} data-testid="casilla-tengo">
          <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
          <span className="pocket-n">{c.l}</span>
          {enCasilla > 1 ? <span className="casilla-cant repetida" title={`${enCasilla - 1} repetidas en la casilla: usa "Ordenar repetidas"`}>×{enCasilla}</span> : otras ? <span className="casilla-cant bulk" title={`${otras} más en Bulk`}>+{otras}</span> : null}
          {enVenta ? <span className="album-venta" title={paraVender && enCasilla > 1 ? `${paraVender} ${paraVender === 1 ? 'copia' : 'copias'} en el álbum, para vender` : 'En venta en el mercado'} data-testid="casilla-venta">{<Icono n="ventas" tam={11} />}{enCasilla > 1 ? <span className="n"> {paraVender}</span> : null}</span> : null}
          <span className="casilla-loc">{(() => { const d = ubicador.donde(es[0]); return d ? <LocChip loc={d} corto /> : null; })()}</span>
        </Link>
      );
    }
    // Mejoras 3 · C: la casilla gris lleva un botón + discreto (agregar rápido); tocar fuera del + sigue abriendo la carta / mercado
    return (
      <>
        <Link href={`/app/carta/${encodeURIComponent(c.id)}#mercado`} className="pocket missing album-cell" title={titulo} data-testid="casilla-falta" onClick={e => { if (c.sd) { e.preventDefault(); setAgregar(c); } }}>
          <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
          <span className="pocket-n">{c.l}</span>
          <span className="casilla-falta">{red ? <span className="casilla-mercado album-red">En mercado · {fmtPen(red.precio_min)}</span> : <span className="casilla-sin">Sin stock</span>}</span>
        </Link>
        {!c.sd ? <button type="button" className="mas-rapido" aria-label={`Agregar ${c.l} ${nombreCarta(c, idioma)} rápido`} title="Agregar rápido" onClick={() => setRapido(c)} data-testid="btn-mas-rapido"><Icono n="mas" tam={20} grosor={2.75} /></button> : null}
      </>
    );
  };
  // Mejoras 4 · A: fila compacta (progreso · % · precio) y menú Acciones en lugar del panel derecho
  const resumen = (
    <span data-testid="progreso-album"><b>{idsPropias.length} / {total}</b> · {pct} % · <b>{fmtPen(stats.valor)}</b>{consultarFaltan ? <span className="muted"> · faltan {fmtPen(stats.faltaPen)}{stats.faltaConPrecio < idsFaltan.length ? <span className="small"> ({stats.faltaConPrecio} con precio)</span> : null}</span> : null}</span>
  );
  const acciones: AccionLibro[] = [
    { texto: 'Agregar carta', icono: 'mas', href: `/app/buscar?q=${encodeURIComponent(set.id)}`, testid: 'btn-agregar-carta', primaria: true },
    ...(idsFaltan.length ? [{ texto: `Comprar faltantes${enVentaFaltan ? ` (${enVentaFaltan} en venta)` : ''}`, icono: 'carrito' as const, href: `/app/mercado?set=${encodeURIComponent(set.id)}&faltan=1`, testid: 'faltan-mercado' }] : []),
    ...(idsPropias.length && sinPublicar.length ? [{ texto: `Poner en venta… (${sinPublicar.length})`, icono: 'ventas' as const, onClick: () => setConfirmarVenta(true), disabled: asignando, testid: 'btn-poner-en-venta' }] : []),
    ...(ordenar.copiasRepetidas ? [{ texto: `Ordenar repetidas (${ordenar.copiasRepetidas})`, icono: 'bulk' as const, onClick: () => setAsistente('repetidas'), testid: 'btn-ordenar-repetidas-album' }] : []),
    ...(ordenar.candidatas.length ? [{ texto: `Traer del Bulk (${ordenar.candidatas.length})`, icono: 'album' as const, onClick: () => setAsistente('llenar'), testid: 'btn-llenar-album' }] : []),
    ...(idsFaltan.length && !consultarFaltan ? [{ texto: 'Precio de las que faltan', icono: 'tendencia' as const, onClick: () => setConsultarFaltan(true), testid: 'btn-precio-faltan' }] : [])
  ];
  const filtros = (
    <div className="seg filtro-album" data-testid="filtro-album">
      <button type="button" className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
      <button type="button" className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {idsPropias.length}</button>
      <button type="button" className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {idsFaltan.length}</button>
    </div>
  );

  return (
    <div className="album-detalle">
      <Libro<Carta>
        items={lista} clave={c => c.id} celda={celda} cuadriculaId={set.id}
        miga={{ href: '/app/album', texto: 'Mis álbumes' }}
        titulo={<>{nombreColeccion(set, idioma, true)}{idiomaAlb && idiomaAlb !== '—' ? <span className={`pill ${idiomaAlb === 'JP' ? 'jp' : 'info'}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{idiomaAlb}</span> : null}</>}
        resumen={resumen} filtros={filtros} acciones={acciones}
        vacio={modo === 'faltan' ? '¡No te falta ninguna!' : modo === 'tengo' ? 'Todavía no tienes cartas de esta colección.' : 'Esta colección no tiene cartas en el catálogo.'}
        pagina={pagina} onPagina={setPagina} mostrarItem={rapido?.id || null} precargar={precargar}
        antes={sinIdioma.length ? (
          <div className="notice info" style={{ marginBottom: 10 }}>
            Estas {sinIdioma.length} {sinIdioma.length === 1 ? 'carta no tiene' : 'cartas no tienen'} idioma registrado. Si todas son del mismo idioma, márcalo aquí y este álbum se unirá con el de ese idioma:
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <select className="input sm" value={idiomaNuevo} onChange={e => setIdiomaNuevo(e.target.value)}>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
              <button className="btn sm primary" disabled={asignando} onClick={asignarIdioma}>{asignando ? 'Guardando…' : `Marcar todas como ${idiomaNuevo}`}</button>
            </div>
          </div>
        ) : null}
      />
      {agregar ? <AddEntrySheet carta={agregar} idiomaInicial={idiomaAlb !== '—' ? idiomaAlb : ''} onClose={() => setAgregar(null)} /> : null}
      {rapido ? <AgregarRapidoSheet key={rapido.id} carta={rapido} set={set} idiomaAlbum={idiomaAlb !== '—' ? idiomaAlb : ''} siguiente={siguienteVacia(rapido)} onClose={() => setRapido(null)} onGuardada={(c, continuar) => setRapido(continuar ? siguienteVacia(c) : null)} /> : null}
      {asistente === 'repetidas' ? <OrdenarRepetidasSheet repetidas={ordenar.repetidas} onClose={() => setAsistente(null)} /> : null}
      {asistente === 'llenar' ? <LlenarAlbumesSheet candidatas={ordenar.candidatas} onClose={() => setAsistente(null)} /> : null}
      {confirmarVenta ? <PonerEnVentaSheet set={set} idioma={idiomaAlb || (set.rg === 'ja' ? 'JP' : '')} entradas={sinPublicar} onClose={() => setConfirmarVenta(false)} /> : null}
    </div>
  );
}
