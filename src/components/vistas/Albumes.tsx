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
import { Campo, useEsPC } from '../ui';

/** Idioma de una entrada para agrupar álbumes: JP para colecciones japonesas, el registrado o "—". */
function idiomaAlbum(e: Entrada, set: Coleccion | undefined): string {
  if (set?.rg === 'ja') return 'JP';
  return e.idioma || '—';
}

type AlbumAuto = { set: Coleccion; idioma: string; entradas: Entrada[]; distintas: number; total: number; portada: Carta | undefined };

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
      if (!a) { a = { set, idioma, entradas: [], distintas: 0, total: cat.cartasDe(set.id).filter(c => !c.sd).length, portada: undefined }; m.set(key, a); }
      a.entradas.push(e);
    }
    for (const a of m.values()) {
      const ids = new Set(a.entradas.map(e => e.carta_id));
      a.distintas = ids.size;
      const propias = cat.cartasDe(a.set.id).filter(c => ids.has(c.id));
      a.portada = propias.find(c => c.c === 'P' && (c.r || '').match(/rare|secret|illustration|ultra|hyper/i)) || propias[0];
    }
    return [...m.values()].sort((a, b) => (b.set.d || '').localeCompare(a.set.d || '') || a.idioma.localeCompare(b.idioma));
  }, [cat, col.entradas]);
}

const ENERGIAS_PORTADA = ['agua', 'fuego', 'planta', 'psiquico', 'electrico'];
/** Color de energía para la portada de un álbum propio sin imagen (estable por id). */
function energiaPortada(id: string): string {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ENERGIAS_PORTADA[h % ENERGIAS_PORTADA.length];
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
  const [nombre, setNombre] = useState(''); const [paginas, setPaginas] = useState(10); const [columnas, setColumnas] = useState(3); const [filas, setFilas] = useState(3);
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
  return (
    <div>
      <div className="solo-celular"><PorLlegar /></div>
      <Recibidas />
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
        {verColeccion ? albumes.map(a => {
          const pct = a.total ? Math.round((a.distintas / a.total) * 100) : 0;
          return (
            <Link key={a.set.id + a.idioma} href={`/app/album/${encodeURIComponent(a.set.id)}?idioma=${encodeURIComponent(a.idioma)}`} className="album-card" data-testid="album-coleccion">
              <div className="album-cover"><Thumb carta={a.portada} set={a.set} className="lg" alt="" idioma={a.idioma} /></div>
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
            <div className="album-cover portada-color" style={{ background: `var(--energia-${energiaPortada(a.id)})` }}><span className="nombre-portada">{a.nombre}</span></div>
            <div className="album-body">
              <div className="album-title"><span className="nombre">{a.nombre}</span><span className="pill warn">Propio</span></div>
              <div className="bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={capacidad ? Math.round((asignadas / capacidad) * 100) : 0} aria-valuemin={0} aria-valuemax={100}><div style={{ width: (capacidad ? Math.round((asignadas / capacidad) * 100) : 0) + '%' }} /></div>
              <div className="album-foot-card"><span>{cartas} {cartas === 1 ? 'carta' : 'cartas'}</span><span>{fmtPen(precio)}</span></div>
            </div>
          </Link>
        )) : null}
      </div>
      {nuevo ? (
        <Sheet titulo="Nuevo álbum" onClose={() => setNuevo(false)} pie={<><button className="btn" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn primary" onClick={async () => { const a = await col.crearAlbum({ nombre, paginas, columnas, filas }); if (a) { toast('Álbum creado', 'ok'); setNuevo(false); router.push(`/app/album/p/${a.id}`); } }}>Crear</button></>}>
          <p className="small muted">Un álbum propio es una carpeta con páginas de bolsillos (por ejemplo 3 × 3). Asigna a cada bolsillo la carta que va ahí para saber qué tienes y qué falta, página por página. Los álbumes por colección se crean solos.</p>
          <Campo label="Nombre">{id => <input id={id} className="input" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Álbum 151, Carpeta azul…" />}</Campo>
          <div className="row wrap">
            <Campo label="Páginas">{id => <input id={id} className="input" type="number" min={1} max={300} value={paginas} onChange={e => setPaginas(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))} />}</Campo>
            <Campo label="Columnas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={columnas} onChange={e => setColumnas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
            <Campo label="Filas por página">{id => <input id={id} className="input" type="number" min={1} max={6} value={filas} onChange={e => setFilas(Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1)))} />}</Campo>
          </div>
          <p className="small muted">Ej.: una carpeta de 3 × 3 con 20 páginas tiene {3 * 3 * 20} bolsillos. Podrás cambiarlo después.</p>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Álbum de una colección (en un idioma) como hoja de carpeta: 3×3 por página en el celular, dos páginas lado a lado en PC. */
const POR_PAGINA = 9;
export function AlbumColeccion({ setId }: { setId: string }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const params = useSearchParams();
  const router = useRouter();
  const esPC = useEsPC();
  const idiomaAlb = params.get('idioma') || '';
  const [modo, setModo] = useState<'todas' | 'tengo' | 'faltan'>('todas');
  const [pagina, setPagina] = useState(1);
  const [agregar, setAgregar] = useState<Carta | null>(null);
  const [consultarFaltan, setConsultarFaltan] = useState(false);
  const [idiomaNuevo, setIdiomaNuevo] = useState('ES');
  const [asignando, setAsignando] = useState(false);
  const [confirmarVenta, setConfirmarVenta] = useState(false);
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
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  useEffect(() => { setPagina(1); }, [modo]);
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas); }, [pagina, totalPaginas]);
  // Mejoras 2 · A: se precargan en segundo plano las imágenes de la página siguiente (la hoja pasa sin esperar)
  useEffect(() => {
    if (!set || typeof window === 'undefined') return;
    const siguientes = (esPC ? [pagina + 2, pagina + 3] : [pagina + 1]).filter(n => n <= totalPaginas).flatMap(n => lista.slice((n - 1) * POR_PAGINA, n * POR_PAGINA));
    const t = setTimeout(() => { for (const c of siguientes) { const u = urlsImagen(c, set, idiomaImagen(idiomaAlb))[0]; if (u) { const im = new Image(); im.decoding = 'async'; im.src = u; } } }, 500);
    return () => clearTimeout(t);
  }, [pagina, esPC, totalPaginas, lista, set, idiomaAlb]);

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
  async function ponerEnVenta() {
    setAsignando(true);
    await precios.pedir([...new Set(sinPublicar.map(e => e.carta_id as string))]).catch(() => {});
    const n = await col.publicarVarias(sinPublicar.map(e => e.id));
    setAsignando(false);
    if (n) toast(`${n} ${n === 1 ? 'carta publicada' : 'cartas publicadas'} con el precio por defecto`, 'ok', 3500); else toast('No se publicó ninguna carta', 'danger');
  }
  const total = cartas.filter(c => !c.sd).length;
  const pct = total ? Math.round((idsPropias.length / total) * 100) : 0;
  const enVentaFaltan = idsFaltan.filter(id => enRed.has(id)).length;
  // PC muestra dos páginas (impar + par); celular una. Las páginas se numeran igual en ambos.
  const inicioPagina = (pagina - 1) * POR_PAGINA;
  const paginasVista = (esPC ? [pagina, pagina + 1] : [pagina]).filter(n => n <= totalPaginas);
  const celdas = (n: number) => lista.slice((n - 1) * POR_PAGINA, n * POR_PAGINA);
  const irA = (n: number) => setPagina(Math.max(1, Math.min(totalPaginas, n)));
  const pasoPC = 2;
  const rangoCartas = `${inicioPagina + 1}–${Math.min(lista.length, inicioPagina + POR_PAGINA)}`;
  const Celda = ({ c }: { c: Carta }) => {
    const es = propias.get(c.id) || [];
    const qty = es.reduce((n, e) => n + e.cantidad, 0);
    const red = enRed.get(c.id);
    const enVenta = es.some(e => col.publicacionDe(e.id)?.estado === 'activa');
    const titulo = `${nombreCarta(c, idioma)} · ${c.l}${qty ? ` · tienes ${qty}` : red ? ` · en el mercado desde ${fmtPen(red.precio_min)}` : ' · te falta'}`;
    if (qty) {
      return (
        <Link href={`/app/carta/${encodeURIComponent(c.id)}`} className="pocket filled album-cell" title={titulo} data-testid="casilla-tengo">
          <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
          <span className="pocket-n">{c.l}</span>
          {qty > 1 ? <span className="casilla-cant">×{qty}</span> : null}
          {enVenta ? <span className="album-venta" title="En venta en el mercado"><Icono n="ventas" tam={11} /></span> : null}
          <span className="casilla-loc">{(() => { const d = ubicador.donde(es[0]); return d ? <LocChip loc={d} corto /> : null; })()}</span>
        </Link>
      );
    }
    return (
      <Link href={`/app/carta/${encodeURIComponent(c.id)}#mercado`} className="pocket missing album-cell" title={titulo} data-testid="casilla-falta" onClick={e => { if (c.sd) { e.preventDefault(); setAgregar(c); } }}>
        <Thumb carta={c} set={set} alt={nombreCarta(c, idioma)} idioma={idiomaAlb} />
        <span className="pocket-n">{c.l}</span>
        <span className="casilla-falta">{red ? <span className="casilla-mercado album-red">En mercado · {fmtPen(red.precio_min)}</span> : <span className="casilla-sin">Sin stock</span>}</span>
      </Link>
    );
  };

  const tarjetaProgreso = (
    <div className="panel progreso-album" data-testid="progreso-album">
      <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="precio-grande">{idsPropias.length}</span><span className="muted" style={{ fontWeight: 700 }}>de {total} · {pct} %</span></div>
      <div className="bar" style={{ margin: '8px 0 10px' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + '%' }} /></div>
      <div className="fila-dato"><span className="muted">Precio del álbum</span><b>{fmtPen(stats.valor)}</b></div>
      <div className="fila-dato"><span className="muted">Para completarlo</span><b>{consultarFaltan ? <>{fmtPen(stats.faltaPen)}{stats.faltaConPrecio < idsFaltan.length ? <span className="small muted"> ({stats.faltaConPrecio} con precio de mercado)</span> : null}</> : idsFaltan.length ? <button className="link" onClick={() => setConsultarFaltan(true)}>Consultar el precio de las que faltan</button> : '—'}</b></div>
    </div>
  );
  const botones = (
    <div className="stack botones-album">
      <Link href={`/app/buscar?q=${encodeURIComponent(set.id)}`} className="btn primary" data-testid="btn-agregar-carta"><Icono n="mas" /> Agregar carta</Link>
      {idsFaltan.length ? <Link href={`/app/mercado?set=${encodeURIComponent(set.id)}&faltan=1`} className="btn" data-testid="faltan-mercado">Comprar faltantes en el mercado{enVentaFaltan ? ` (${enVentaFaltan} en venta)` : ''}</Link> : null}
      {idsPropias.length ? (sinPublicar.length ? <button className="btn" disabled={asignando} onClick={() => setConfirmarVenta(true)} data-testid="btn-poner-en-venta">Poner en venta… ({sinPublicar.length})</button> : <span className="small muted" style={{ textAlign: 'center' }}>Todo lo que tienes de esta colección está en el mercado.</span>) : null}
    </div>
  );
  const irAPagina = totalPaginas > 1 ? (
    <div className="panel ir-a-pagina solo-pc-block" data-testid="ir-a-pagina">
      <b>Ir a página</b>
      <div className="paginas">
        {(() => { const ini = Math.max(1, Math.min(pagina - 4, totalPaginas - 9)); const fin = Math.min(totalPaginas, ini + 9); const out = []; for (let n = ini; n <= fin; n++) out.push(<button key={n} className={paginasVista.includes(n) ? 'active' : ''} onClick={() => irA(n % 2 === 0 ? n - 1 : n)} aria-current={paginasVista.includes(n) ? 'page' : undefined}>{n}</button>); return out; })()}
      </div>
    </div>
  ) : null;

  return (
    <div className="album-detalle">
      <p className="small migas solo-pc-block"><Link href="/app/album" className="miga"><Icono n="izquierda" tam={16} /> Mis álbumes</Link></p>
      <div className="cabecera-seccion">
        <h1 className="titulo-album" style={{ margin: 0 }}>{nombreColeccion(set, idioma, true)}{idiomaAlb && idiomaAlb !== '—' ? <span className={`pill ${idiomaAlb === 'JP' ? 'jp' : 'info'}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{idiomaAlb}</span> : null}</h1>
        <div className="seg filtro-album solo-pc" data-testid="filtro-album-pc">
          <button className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
          <button className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {idsPropias.length}</button>
          <button className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {idsFaltan.length}</button>
        </div>
      </div>
      {sinIdioma.length ? (
        <div className="notice info" style={{ marginBottom: 10 }}>
          Estas {sinIdioma.length} {sinIdioma.length === 1 ? 'carta no tiene' : 'cartas no tienen'} idioma registrado. Si todas son del mismo idioma, márcalo aquí y este álbum se unirá con el de ese idioma:
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <select className="input sm" value={idiomaNuevo} onChange={e => setIdiomaNuevo(e.target.value)}>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>
            <button className="btn sm primary" disabled={asignando} onClick={asignarIdioma}>{asignando ? 'Guardando…' : `Marcar todas como ${idiomaNuevo}`}</button>
          </div>
        </div>
      ) : null}
      <div className="album-cuerpo">
        <div className="album-principal">
          <div className="solo-celular">{tarjetaProgreso}</div>
          <div className="seg filtro-album solo-celular" data-testid="filtro-album" style={{ marginBottom: 10 }}>
            <button className={modo === 'todas' ? 'active' : ''} onClick={() => setModo('todas')}>Todas</button>
            <button className={modo === 'tengo' ? 'active' : ''} onClick={() => setModo('tengo')}>Tengo · {idsPropias.length}</button>
            <button className={modo === 'faltan' ? 'active' : ''} onClick={() => setModo('faltan')}>Faltan · {idsFaltan.length}</button>
          </div>
          <div className="nav-pagina solo-celular">
            <button className="btn icon" onClick={() => irA(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior" data-testid="pagina-anterior"><Icono n="izquierda" tam={22} /></button>
            <div className="texto" data-testid="pagina-texto"><b>Página {pagina} de {totalPaginas}</b><span className="small muted"> · cartas {rangoCartas}</span></div>
            <button className="btn icon" onClick={() => irA(pagina + 1)} disabled={pagina >= totalPaginas} aria-label="Página siguiente" data-testid="pagina-siguiente"><Icono n="derecha" tam={22} /></button>
          </div>
          {!lista.length ? <div className="empty">{modo === 'faltan' ? '¡No te falta ninguna!' : modo === 'tengo' ? 'Todavía no tienes cartas de esta colección.' : 'Esta colección no tiene cartas en el catálogo.'}</div> : (
            <div className={`hoja-carpeta ${paginasVista.length > 1 ? 'doble' : ''}`} data-testid="hoja-carpeta">
              {paginasVista.map(n => <div key={n} className="pagina-carpeta" data-pagina={n}>{celdas(n).map(c => <Celda key={c.id} c={c} />)}</div>)}
            </div>
          )}
          {totalPaginas > 1 && totalPaginas <= 12 ? <div className="puntos-pagina solo-celular" aria-hidden="true">{Array.from({ length: totalPaginas }, (_, k) => <span key={k} className={k + 1 === pagina ? 'on' : ''} />)}</div> : null}
          {totalPaginas > 1 ? (
            <div className="nav-pagina solo-pc-flex" style={{ marginTop: 14 }}>
              <button className="btn icon" onClick={() => irA(pagina - pasoPC)} disabled={pagina <= 1} aria-label="Páginas anteriores"><Icono n="izquierda" tam={22} /></button>
              <div className="texto"><b>{paginasVista.length > 1 ? `Páginas ${paginasVista[0]} – ${paginasVista[1]}` : `Página ${pagina}`} de {totalPaginas}</b></div>
              <button className="btn icon" onClick={() => irA(pagina + pasoPC)} disabled={pagina + pasoPC > totalPaginas} aria-label="Páginas siguientes"><Icono n="derecha" tam={22} /></button>
            </div>
          ) : null}
          <div className="solo-celular" style={{ marginTop: 14 }}>{botones}</div>
        </div>
        <aside className="album-lateral solo-pc-block">
          {tarjetaProgreso}
          {botones}
          {irAPagina}
        </aside>
      </div>
      {agregar ? <AddEntrySheet carta={agregar} idiomaInicial={idiomaAlb !== '—' ? idiomaAlb : ''} onClose={() => setAgregar(null)} /> : null}
      {confirmarVenta ? <Confirmar titulo="Poner en venta" texto={`Se publicarán en el mercado ${sinPublicar.length} ${sinPublicar.length === 1 ? 'carta' : 'cartas'} de ${nombreColeccion(set, idioma, true)} con el precio por defecto (el mayor entre el piso y el precio de mercado). Podrás cambiar precios, pausar o retirar cuando quieras; las de más de S/ 50 quedan pausadas hasta que les agregues una foto.`} okLabel="Publicar" onOk={() => { setConfirmarVenta(false); ponerEnVenta(); }} onClose={() => setConfirmarVenta(false)} /> : null}
    </div>
  );
}
