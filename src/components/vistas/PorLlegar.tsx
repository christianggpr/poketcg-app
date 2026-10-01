'use client';
import { Icono } from '../Icono';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel, type Carta } from '@/lib/catalogo';
import { cajasOrdenadas, type Entrada } from '@/lib/coleccion';
import { fechaDia, ordenesDe, type Orden, type OrdenItem, type Tienda } from '@/lib/compras';
import { albumesPorColeccion, sugerirBulk, sugerirDestino, type Alternativa } from '@/lib/sugerir';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
import { usePrecios } from '../PreciosProvider';
import { fmtPen } from '@/lib/precios-core';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { Colocacion } from '../Ubicacion';
import { useToast } from '../Toast';

const PENDIENTES = new Set(['revision', 'pago_confirmado', 'en_tienda', 'disputa']);

function estadoCompra(o: Orden, tienda?: Tienda): { texto: string; clase: string; fecha: string } {
  switch (o.estado) {
    case 'revision': return { texto: 'Pago en revisión', clase: 'warn', fecha: 'cuando se confirme el pago el vendedor elige la fecha' };
    case 'pago_confirmado': return { texto: o.fecha_entrega ? 'Por entregar en la tienda' : 'Esperando que el vendedor elija fecha', clase: 'primary', fecha: o.fecha_entrega ? `llega el ${fechaDia(o.fecha_entrega)}` : `a más tardar el ${fechaDia(o.fecha_limite)}` };
    case 'en_tienda': return { texto: 'En la tienda · lista para recoger', clase: 'ok', fecha: tienda ? `en ${tienda.nombre}${tienda.distrito ? ' (' + tienda.distrito + ')' : ''}` : 'con tu código de retiro' };
    case 'disputa': return { texto: 'En reclamo', clase: 'danger', fecha: 'el administrador lo está revisando' };
    default: return { texto: o.estado, clase: '', fecha: '' };
  }
}

/** Compras pagadas que aún no recibí (Mejoras 1 · C2), con el estado y la fecha estimada de cada carta.
 *  `compacto`: versión del menú lateral de PC (título «Por llegar · N» y filas cortas). */
export function PorLlegar({ compacto }: { compacto?: boolean }) {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const [datos, setDatos] = useState<{ ordenes: Orden[]; items: OrdenItem[]; tiendas: Map<string, Tienda> } | null>(null);
  useEffect(() => { ordenesDe('comprador_id', perfil.id).then(setDatos).catch(() => setDatos({ ordenes: [], items: [], tiendas: new Map() })); }, [perfil.id, mercado.version]);
  const pendientes = (datos?.ordenes || []).filter(o => PENDIENTES.has(o.estado));
  if (!datos || !pendientes.length) return null;
  const unidades = pendientes.reduce((n, o) => n + datos.items.filter(i => i.orden_id === o.id).reduce((m, i) => m + i.cantidad, 0), 0);
  const filas = pendientes.flatMap(o => { const est = estadoCompra(o, datos.tiendas.get(o.tienda_id || '')); return datos.items.filter(i => i.orden_id === o.id).map(i => ({ o, i, est, c: cat.carta(i.carta_id) })); });
  if (compacto) {
    return (
      <div className="panel lateral-por-llegar" data-testid="por-llegar-lateral">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Por llegar <span className="count">{unidades}</span></h3><Link href="/app/compras" className="small">Ver compras</Link></div>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {filas.slice(0, 4).map(({ o, i, est, c }) => (
            <Link key={i.id} href={`/app/compras/${o.pago_id}`} className="fila-llegar" data-testid="carta-por-llegar-lateral">
              <Thumb carta={c} set={c ? cat.setOf(c) : undefined} />
              <div className="grow" style={{ minWidth: 0 }}><b className="nombre">{i.cantidad > 1 ? `${i.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id}</b><span className={`estado ${est.clase === 'ok' ? 'ok' : est.clase === 'danger' ? 'peligro' : est.clase === 'primary' ? 'info' : 'aviso'}`}>{est.texto}</span></div>
            </Link>
          ))}
          {filas.length > 4 ? <Link href="/app/compras" className="small">y {filas.length - 4} más…</Link> : null}
        </div>
      </div>
    );
  }
  return (
    <section className="bloque por-llegar" data-testid="por-llegar">
      <h3><span className="ico-texto"><Icono n="bulk" /> Por llegar <span className="count">{unidades}</span></span><Link href="/app/compras" className="small">Ver compras</Link></h3>
      <div className="card-list">
        {filas.map(({ o, i, est, c }) => { const set = c ? cat.setOf(c) : undefined; return (
          <Link key={i.id} href={`/app/compras/${o.pago_id}`} className="card-row" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="carta-por-llegar">
            <Thumb carta={c} set={set} />
            <div className="card-main">
              <div className="card-name">{i.cantidad > 1 ? `${i.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id}</div>
              <div className="card-set">{c ? <>{nombreColeccion(set, perfil.idioma_nombres)} · <span className="num">{numLabel(c, set)}</span></> : null}{i.idioma ? <> · {i.idioma}</> : null}{i.condicion ? <> · {i.condicion}</> : null} · orden #{o.numero}</div>
              <div style={{ marginTop: 5 }}><span className={`estado ${est.clase === 'ok' ? 'ok' : est.clase === 'danger' ? 'peligro' : est.clase === 'primary' ? 'info' : 'aviso'}`}>{est.texto}{est.fecha ? ` · ${est.fecha}` : ''}</span></div>
            </div>
            <Icono n="derecha" tam={18} className="faint" />
          </Link>
        ); })}
      </div>
    </section>
  );
}

/** Cartas compradas ya entregadas que aún no tienen lugar: sugerencia de destino y guardado con un toque (C2/C3).
 *  Cada carta abre la hoja «¿Dónde la guardas?» (celular) / ventana (PC) con el destino sugerido, elegir otro álbum o Bulk. */
export function Recibidas() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const [abierta, setAbierta] = useState<string | null>(null);
  const enBolsillo = useMemo(() => new Set(col.casillas.filter(c => c.entrada_id).map(c => c.entrada_id as string)), [col.casillas]);
  const recibidas = col.entradas.filter(e => e.compra_orden_id && !e.caja_id && !e.album_coleccion && !enBolsillo.has(e.id)).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  const ctx = { cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId };
  const entradaAbierta = abierta ? col.entradas.find(e => e.id === abierta) || null : null;
  if (!recibidas.length && !entradaAbierta) return null;
  return (
    <section className="bloque recibidas" data-testid="recibidas">
      <h3><span className="ico-texto"><Icono n="entrada" /> Recibidas: ¿dónde las guardas? <span className="count">({recibidas.reduce((n, e) => n + e.cantidad, 0)})</span></span></h3>
      <p className="small muted" style={{ marginTop: -4 }}>Ya son tuyas. La app sugiere un lugar mirando cómo coleccionas; tú decides.</p>
      <div className="card-list">
        {recibidas.map(e => { const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; const s = c ? sugerirDestino(ctx, c, e.idioma, e.id) : null; return (
          <div key={e.id} className="card-row" role="button" tabIndex={0} onClick={() => setAbierta(e.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setAbierta(e.id); } }} data-testid="carta-recibida">
            <Thumb carta={c} set={set} />
            <div className="card-main">
              <div className="card-name">{e.cantidad > 1 ? `${e.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : e.personalizada?.nombre}</div>
              <div className="card-set">{c ? <>{nombreColeccion(set, perfil.idioma_nombres)} · <span className="num">{numLabel(c, set)}</span></> : null}{e.idioma ? <> · {e.idioma}</> : null}{e.condicion ? <> · {e.condicion}</> : null}</div>
              {s ? <div className="small sugerencia-corta" data-testid="sugerencia"><span className="rotulo-sug">{'repetida' in s && s.repetida ? 'Repetida' : 'Sugerido'}</span> <b>{s.etiqueta}{s.tipo === 'bulk' ? ` · posición #${s.posicion}` : s.tipo === 'album' ? ` · bolsillo ${s.indice + 1}` : s.tipo === 'coleccion' && c ? ` · casilla ${c.l}` : ''}</b><span className="muted"> · {s.motivo}</span>{'aviso' in s && s.aviso ? <span className="warn"> {s.aviso}</span> : null}</div> : <div className="small muted">Crea un Bulk o un álbum para guardarla.</div>}
            </div>
            <button className="btn sm primary" onClick={ev => { ev.stopPropagation(); setAbierta(e.id); }} data-testid="btn-recibida-guardar">Guardar</button>
          </div>
        ); })}
      </div>
      {entradaAbierta ? <HojaRecibida entrada={entradaAbierta} onClose={() => setAbierta(null)} /> : null}
    </section>
  );
}

/** Hoja «¿Dónde la guardas?» de una carta recibida: destino sugerido, elegir otro álbum, Bulk con posición, o decidir después. */
function HojaRecibida({ entrada, onClose }: { entrada: Entrada; onClose: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const precios = usePrecios();
  const toast = useToast();
  const [elegir, setElegir] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const c = cat.carta(entrada.carta_id);
  const set = c ? cat.setOf(c) : undefined;
  const ctx = { cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId };
  const s = c ? sugerirDestino(ctx, c, entrada.idioma, entrada.id) : null;
  const bulk = c && s?.tipo !== 'bulk' ? sugerirBulk(ctx, c, entrada.idioma, entrada.id) : null;
  const precio = c && !c.sd ? precios.precioDefecto(c, entrada.acabado).pen : null;
  const idiomaTxt: Record<string, string> = { ES: 'Español', EN: 'Inglés', JP: 'Japonés', PT: 'Portugués', FR: 'Francés', DE: 'Alemán', IT: 'Italiano' };
  // Mejoras 2 · B: al álbum va 1 copia; si la entrada trae varias, las demás van al Bulk (o quedan por colocar)
  const [cantidadInicial] = useState(entrada.cantidad);   // la entrada cambia al dividirse: se recuerda cuántas traía
  const extras = cantidadInicial - 1;
  const bulkExtras = s?.tipo === 'bulk' ? s : bulk;
  const casillaTxt = (sug: Alternativa) => {
    if (sug.tipo === 'coleccion') { const n = c ? parseInt(c.l, 10) : NaN; return `${isFinite(n) ? `Página ${Math.ceil(n / 9)} · ` : ''}casilla ${c?.l} (está vacía)`; }
    if (sug.tipo === 'album') return `Página ${Math.floor(sug.indice / (sug.album.columnas * sug.album.filas)) + 1} · bolsillo ${(sug.indice % (sug.album.columnas * sug.album.filas)) + 1}`;
    if (sug.tipo === 'bulk') return `Posición #${sug.posicion} de ${sug.total}`;
    return 'Todavía no tienes ningún Bulk';
  };
  async function aplicar(sug: Alternativa) {
    setOcupado(true);
    let ok = false;
    if (sug.tipo === 'coleccion') {
      if (extras > 0) {
        // 1 copia al álbum; las otras se quedan en esta entrada (en el Bulk sugerido, o por colocar si no hay)
        if (bulkExtras) { const m = await col.editarEntrada(entrada.id, { caja_id: bulkExtras.caja.id }); if (!m) { setOcupado(false); toast(col.error || 'No se pudo guardar', 'danger', 4000); return; } }
        const r = await col.dividirEntrada(entrada.id, 1, { album: sug.set });
        ok = r.ok;
      } else ok = await col.colocarEnColeccion(entrada.id, sug.set);
    } else if (sug.tipo === 'album') ok = await col.colocarEnAlbum(entrada.id, sug.album.id, sug.indice);
    else if (sug.tipo === 'bulk') ok = await col.editarEntrada(entrada.id, { caja_id: sug.caja.id });
    else { const caja = await col.crearCaja({ nombre: 'Bulk 1' }); ok = !!caja && (await col.editarEntrada(entrada.id, { caja_id: caja.id })); }
    setOcupado(false);
    if (!ok) { toast(col.error || 'No se pudo guardar', 'danger', 4000); return; }
    setGuardada(true);
  }
  if (elegir) return <ElegirDestino entrada={entrada} onClose={() => setElegir(false)} onGuardada={() => { setElegir(false); setGuardada(true); }} />;
  if (guardada) {
    // si se dividió (1 al álbum, el resto al Bulk) se muestra la copia del álbum y dónde quedaron las demás
    const actual = col.entradas.find(e => e.id === entrada.id) || entrada;
    const enAlbum = extras > 0 ? col.entradas.find(e => e.id !== entrada.id && e.carta_id === entrada.carta_id && e.album_coleccion && e.compra_orden_id === entrada.compra_orden_id && e.idioma === entrada.idioma) : null;
    const principal = enAlbum || actual;
    const cajaExtras = enAlbum ? col.cajas.find(x => x.id === actual.caja_id) : null;
    return (
      <Sheet titulo="¡Guardada!" onClose={onClose} pie={<button className="btn primary" onClick={onClose} data-testid="btn-guardada-listo">Listo</button>}>
        <div data-testid="colocacion"><Colocacion entrada={principal} loc={ubicador.donde(principal)} /></div>
        {enAlbum ? <p className="notice info small" style={{ marginTop: 10 }} data-testid="repetidas-guardadas">La casilla guarda 1 copia. {extras === 1 ? 'La otra copia' : `Las otras ${extras} copias`} {cajaExtras ? <>{extras === 1 ? 'fue' : 'fueron'} a <b>{cajaExtras.nombre}</b> como repetidas.</> : <>{extras === 1 ? 'quedó' : 'quedaron'} <b>por colocar</b>.</>}</p> : null}
      </Sheet>
    );
  }
  return (
    <Sheet sobre={<span className="ok-texto"><Icono n="ok" tam={14} /> Entregada · ya es tuya</span>} titulo="¿Dónde la guardas?" onClose={onClose} className="hoja-recibida">
      <div className="panel fila-carta-recibida">
        <Thumb carta={c} set={set} className="lg" />
        <div className="grow">
          <b className="nombre">{entrada.cantidad > 1 ? `${entrada.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : entrada.personalizada?.nombre}</b>
          <div className="small muted">{c ? <>{nombreColeccion(set, perfil.idioma_nombres)} · #{c.l}</> : null}</div>
          <div className="small muted">{[entrada.idioma ? idiomaTxt[entrada.idioma] || entrada.idioma : '', entrada.condicion, precio != null ? fmtPen(precio) : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {s ? (
        <div className={`sugerencia caja-sugerida ${'repetida' in s && s.repetida ? 'repetida' : ''}`} data-testid="sugerencia-hoja">
          <span className="rotulo-sug">{'repetida' in s && s.repetida ? 'Repetida' : 'Sugerido'}</span>
          <b className="titulo-sug">{s.etiqueta}</b>
          <div className="detalle-sug">{casillaTxt(s)}</div>
          <div className="small muted motivo-sug"><Icono n="info" tam={14} /> {s.motivo}</div>
          {'aviso' in s && s.aviso ? <div className="warn small"><Icono n="alerta" tam={14} /> {s.aviso}</div> : null}
          {s.tipo === 'coleccion' && extras > 0 ? <div className="small" style={{ marginTop: 6 }} data-testid="aviso-copias-album">La casilla guarda 1 copia: {extras === 1 ? 'la otra va' : `las otras ${extras} van`} {bulkExtras ? <>a <b>{bulkExtras.caja.nombre}</b> como repetidas (posición #{bulkExtras.posicion})</> : <b>por colocar (crea un Bulk para guardarlas)</b>}.</div> : null}
        </div>
      ) : <p className="small muted">Crea un Bulk o un álbum para guardarla.</p>}
      <div className="stack botones-recibida">
        {s ? <button className="btn primary grande" disabled={ocupado} onClick={() => aplicar(s)} data-testid="btn-guardar-sugerido">{ocupado ? 'Guardando…' : s.tipo === 'bulk' ? `${s.repetida ? 'Mandar a' : 'Guardar en'} ${s.caja.nombre} · posición #${s.posicion}` : s.tipo === 'crear-bulk' ? 'Crear un Bulk y guardarla ahí' : s.tipo === 'coleccion' && s.crear ? 'Crear el álbum y guardarla' : 'Guardar en este álbum'}</button> : null}
        {s && s.tipo === 'coleccion' && s.alternativas?.filter(a => a.tipo !== 'bulk').map((a, i) => <button key={i} className="btn" disabled={ocupado} onClick={() => aplicar(a)} data-testid="btn-alternativa">{a.etiqueta}{a.tipo === 'album' ? ` · bolsillo ${a.indice + 1}` : ''}</button>)}
        <button className="btn" disabled={ocupado} onClick={() => setElegir(true)} data-testid="btn-elegir-album">Elegir otro álbum</button>
        {bulk ? <button className="btn" disabled={ocupado} onClick={() => aplicar(bulk)} data-testid="btn-guardar-bulk">Guardar en {bulk.caja.nombre} · posición #{bulk.posicion}</button> : null}
        <button className="link centrado" onClick={onClose} data-testid="btn-decidir-despues">Decidir después</button>
      </div>
    </Sheet>
  );
}

/** Hoja para elegir a mano el destino de una carta: álbum por colección, álbum personalizado (siguiente bolsillo libre) o Bulk. */
export function ElegirDestino({ entrada, onClose, onGuardada }: { entrada: Entrada; onClose: () => void; onGuardada: (id: string) => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const carta = cat.carta(entrada.carta_id) as Carta | undefined;
  const porColeccion = [...albumesPorColeccion(cat, col.entradas.filter(e => e.id !== entrada.id)).values()].sort((a, b) => b.cartas - a.cartas);
  const idiomaCarta = entrada.idioma || (carta && cat.setOf(carta)?.rg === 'ja' ? 'JP' : 'EN');
  const bolsilloLibre = (albumId: string, capacidad: number) => { const ocupados = new Set(col.casillas.filter(c => c.album_id === albumId && (c.carta_id || c.entrada_id)).map(c => c.indice)); const propio = col.casillas.find(c => c.album_id === albumId && c.carta_id === entrada.carta_id && !c.entrada_id); if (propio) return propio.indice; for (let i = 0; i < capacidad; i++) if (!ocupados.has(i)) return i; return -1; };
  async function ir(f: () => Promise<boolean>) {
    setOcupado(true);
    const ok = await f();
    setOcupado(false);
    if (ok) onGuardada(entrada.id); else toast(col.error || 'No se pudo guardar', 'danger', 4000);
  }
  return (
    <Sheet titulo="¿Dónde la guardas?" onClose={onClose} pie={<button className="btn" onClick={onClose}>Cancelar</button>}>
      {carta ? (
        <>
          <h4 style={{ margin: '4px 0 6px' }}><Icono n="album" /> Álbum de esta colección</h4>
          <div className="stack">
            <button className="btn" disabled={ocupado} onClick={() => ir(() => col.colocarEnColeccion(entrada.id, carta.s))} data-testid="destino-coleccion">Álbum {nombreColeccion(cat.setOf(carta), perfil.idioma_nombres, true)} {idiomaCarta} · casilla {carta.l}{porColeccion.some(v => v.set === carta.s && v.idioma === idiomaCarta) ? '' : ' (nuevo)'}</button>
          </div>
          {porColeccion.filter(v => v.set !== carta.s).length ? <p className="small muted" style={{ margin: '6px 0 0' }}>Tus otros álbumes por colección son de otras colecciones; una carta de {nombreColeccion(cat.setOf(carta), perfil.idioma_nombres, true)} va en el álbum de su propia colección.</p> : null}
        </>
      ) : null}
      {col.albumes.length ? (
        <>
          <h4 style={{ margin: '12px 0 6px' }}><Icono n="album" /> Álbum personalizado (siguiente bolsillo libre)</h4>
          <div className="stack">
            {col.albumes.map(a => { const cap = a.paginas * a.columnas * a.filas; const i = bolsilloLibre(a.id, cap); return <button key={a.id} className="btn" disabled={ocupado || i < 0} onClick={() => ir(() => col.colocarEnAlbum(entrada.id, a.id, i))} data-testid="destino-album">{a.nombre}{i >= 0 ? ` · pág. ${Math.floor(i / (a.columnas * a.filas)) + 1}, bolsillo ${(i % (a.columnas * a.filas)) + 1}` : ' · lleno'}</button>; })}
          </div>
        </>
      ) : null}
      <h4 style={{ margin: '12px 0 6px' }}><Icono n="bulk" /> Bulk</h4>
      {!col.cajas.length ? <p className="small muted">Todavía no tienes Bulks: créalos en Mi Colección → Bulk.</p> : null}
      <div className="stack">
        {cajasOrdenadas(col.cajas).map(c => <button key={c.id} className="btn" disabled={ocupado} onClick={() => ir(() => col.editarEntrada(entrada.id, { caja_id: c.id }))} data-testid="destino-bulk">{c.nombre}{c.descripcion ? <span className="muted"> · {c.descripcion}</span> : null}</button>)}
      </div>
    </Sheet>
  );
}
