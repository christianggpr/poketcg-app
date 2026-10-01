'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel, type Carta } from '@/lib/catalogo';
import { cajasOrdenadas, type Entrada } from '@/lib/coleccion';
import { fechaDia, ordenesDe, type Orden, type OrdenItem, type Tienda } from '@/lib/compras';
import { albumesPorColeccion, sugerirDestino, type Sugerencia } from '@/lib/sugerir';
import { useCatalogo } from '../CatalogoProvider';
import { useColeccion } from '../ColeccionProvider';
import { useMercado } from '../MercadoProvider';
import { usePerfil } from '../PerfilProvider';
import { useUbicador } from '../useUbicador';
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

/** Compras pagadas que aún no recibí (Mejoras 1 · C2), con el estado y la fecha estimada de cada carta. */
export function PorLlegar() {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const mercado = useMercado();
  const [datos, setDatos] = useState<{ ordenes: Orden[]; items: OrdenItem[]; tiendas: Map<string, Tienda> } | null>(null);
  useEffect(() => { ordenesDe('comprador_id', perfil.id).then(setDatos).catch(() => setDatos({ ordenes: [], items: [], tiendas: new Map() })); }, [perfil.id, mercado.version]);
  const pendientes = (datos?.ordenes || []).filter(o => PENDIENTES.has(o.estado));
  if (!datos || !pendientes.length) return null;
  return (
    <div className="panel" style={{ marginBottom: 12 }} data-testid="por-llegar">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>📦 Por llegar <span className="muted">({pendientes.reduce((n, o) => n + datos.items.filter(i => i.orden_id === o.id).reduce((m, i) => m + i.cantidad, 0), 0)})</span></h3>
        <Link href="/app/compras" className="btn sm ghost">🧾 Mis compras</Link>
      </div>
      <p className="small muted">Cartas que compraste y todavía no recibes. Cuando recojas la orden y la marques como entregada, aparecerán abajo para guardarlas.</p>
      <div className="card-list">
        {pendientes.map(o => { const est = estadoCompra(o, datos.tiendas.get(o.tienda_id || '')); return datos.items.filter(i => i.orden_id === o.id).map(i => { const c = cat.carta(i.carta_id); const set = c ? cat.setOf(c) : undefined; return (
          <Link key={i.id} href={`/app/compras/${o.pago_id}`} className="card-row" style={{ textDecoration: 'none', color: 'inherit' }} data-testid="carta-por-llegar">
            <Thumb carta={c} set={set} />
            <div className="card-main">
              <div className="card-name">{i.cantidad > 1 ? `${i.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id}{i.idioma ? <span className="pill">{i.idioma}</span> : null}{i.condicion ? <span className="pill">{i.condicion}</span> : null}</div>
              <div className="card-set">{c ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(c, set)}</span> · </> : null}orden #{o.numero}</div>
              <div className="small" style={{ marginTop: 3 }}><span className={`pill ${est.clase}`}>{est.texto}</span> <span className="muted">{est.fecha}</span></div>
            </div>
          </Link>
        ); }); })}
      </div>
    </div>
  );
}

/** Cartas compradas ya entregadas que aún no tienen lugar: sugerencia de destino y guardado con un toque (C2/C3). */
export function Recibidas() {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const ubicador = useUbicador();
  const toast = useToast();
  const [elegir, setElegir] = useState<Entrada | null>(null);
  const [guardada, setGuardada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const enBolsillo = useMemo(() => new Set(col.casillas.filter(c => c.entrada_id).map(c => c.entrada_id as string)), [col.casillas]);
  const recibidas = col.entradas.filter(e => e.compra_orden_id && !e.caja_id && !e.album_coleccion && !enBolsillo.has(e.id)).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  const ctx = { cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId };
  const entradaGuardada = guardada ? col.entradas.find(e => e.id === guardada) || null : null;

  async function aplicar(e: Entrada, s: Sugerencia) {
    if (!s) return;
    setOcupado(e.id);
    let ok = false;
    if (s.tipo === 'coleccion') ok = await col.colocarEnColeccion(e.id, s.set);
    else if (s.tipo === 'album') ok = await col.colocarEnAlbum(e.id, s.album.id, s.indice);
    else ok = await col.editarEntrada(e.id, { caja_id: s.caja.id });
    setOcupado(null);
    if (!ok) { toast(col.error || 'No se pudo guardar', 'danger', 4000); return; }
    setGuardada(e.id);
  }
  if (!recibidas.length) return null;
  return (
    <div className="panel" style={{ marginBottom: 12 }} data-testid="recibidas">
      <h3 style={{ margin: 0 }}>📥 Recibidas: ¿dónde las guardas? <span className="muted">({recibidas.reduce((n, e) => n + e.cantidad, 0)})</span></h3>
      <p className="small muted">Ya son tuyas. La app sugiere un lugar mirando cómo coleccionas; tú decides.</p>
      <div className="card-list">
        {recibidas.map(e => { const c = cat.carta(e.carta_id); const set = c ? cat.setOf(c) : undefined; const s = c ? sugerirDestino(ctx, c, e.idioma, e.id) : null; return (
          <div key={e.id} className="card-row" style={{ cursor: 'default', flexWrap: 'wrap' }} data-testid="carta-recibida">
            <Thumb carta={c} set={set} />
            <div className="card-main">
              <div className="card-name">{e.cantidad > 1 ? `${e.cantidad}× ` : ''}{c ? nombreCarta(c, perfil.idioma_nombres) : e.personalizada?.nombre}{e.idioma ? <span className="pill">{e.idioma}</span> : null}{e.acabado ? <span className="pill">{e.acabado}</span> : null}{e.condicion ? <span className="pill">{e.condicion}</span> : null}</div>
              <div className="card-set">{c ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(c, set)}</span></> : null}{e.nota ? <span className="muted"> · {e.nota}</span> : null}</div>
              {s ? <div className="sugerencia small" data-testid="sugerencia"><b>✨ Sugerencia: {s.etiqueta}</b>{s.tipo === 'bulk' ? ` · posición #${s.posicion}` : s.tipo === 'album' ? ` · bolsillo ${s.indice + 1}` : c ? ` · casilla ${c.l}` : ''}<div className="muted">{s.motivo}</div>{'aviso' in s && s.aviso ? <div className="warn">⚠️ {s.aviso}</div> : null}</div> : <div className="small muted">Crea un Bulk o un álbum para guardarla.</div>}
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {s ? <button className="btn sm primary" disabled={ocupado === e.id} onClick={() => aplicar(e, s)} data-testid="btn-guardar-sugerido">{ocupado === e.id ? '…' : `Guardar en ${s.etiqueta}`}</button> : null}
                <button className="btn sm" onClick={() => setElegir(e)} data-testid="btn-elegir-album">Elegir otro álbum</button>
                {s?.tipo !== 'bulk' ? <button className="btn sm ghost" onClick={() => setElegir(e)} data-testid="btn-guardar-bulk">Guardar en Bulk</button> : null}
              </div>
            </div>
          </div>
        ); })}
      </div>
      {elegir ? <ElegirDestino entrada={elegir} onClose={() => setElegir(null)} onGuardada={id => { setElegir(null); setGuardada(id); }} /> : null}
      {entradaGuardada ? (
        <Sheet titulo="¡Guardada!" onClose={() => setGuardada(null)} pie={<button className="btn primary" onClick={() => setGuardada(null)} data-testid="btn-guardada-listo">Listo</button>}>
          <div data-testid="colocacion"><Colocacion entrada={entradaGuardada} loc={ubicador.donde(entradaGuardada)} /></div>
        </Sheet>
      ) : null}
    </div>
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
          <h4 style={{ margin: '4px 0 6px' }}>📒 Álbum de esta colección</h4>
          <div className="stack">
            <button className="btn" disabled={ocupado} onClick={() => ir(() => col.colocarEnColeccion(entrada.id, carta.s))} data-testid="destino-coleccion">Álbum {nombreColeccion(cat.setOf(carta), perfil.idioma_nombres, true)} {idiomaCarta} · casilla {carta.l}{porColeccion.some(v => v.set === carta.s && v.idioma === idiomaCarta) ? '' : ' (nuevo)'}</button>
          </div>
          {porColeccion.filter(v => v.set !== carta.s).length ? <p className="small muted" style={{ margin: '6px 0 0' }}>Tus otros álbumes por colección son de otras colecciones; una carta de {nombreColeccion(cat.setOf(carta), perfil.idioma_nombres, true)} va en el álbum de su propia colección.</p> : null}
        </>
      ) : null}
      {col.albumes.length ? (
        <>
          <h4 style={{ margin: '12px 0 6px' }}>📒 Álbum personalizado (siguiente bolsillo libre)</h4>
          <div className="stack">
            {col.albumes.map(a => { const cap = a.paginas * a.columnas * a.filas; const i = bolsilloLibre(a.id, cap); return <button key={a.id} className="btn" disabled={ocupado || i < 0} onClick={() => ir(() => col.colocarEnAlbum(entrada.id, a.id, i))} data-testid="destino-album">{a.nombre}{i >= 0 ? ` · pág. ${Math.floor(i / (a.columnas * a.filas)) + 1}, bolsillo ${(i % (a.columnas * a.filas)) + 1}` : ' · lleno'}</button>; })}
          </div>
        </>
      ) : null}
      <h4 style={{ margin: '12px 0 6px' }}>📦 Bulk</h4>
      {!col.cajas.length ? <p className="small muted">Todavía no tienes Bulks: créalos en Mi Colección → Bulk.</p> : null}
      <div className="stack">
        {cajasOrdenadas(col.cajas).map(c => <button key={c.id} className="btn" disabled={ocupado} onClick={() => ir(() => col.editarEntrada(entrada.id, { caja_id: c.id }))} data-testid="destino-bulk">{c.nombre}{c.descripcion ? <span className="muted"> · {c.descripcion}</span> : null}</button>)}
      </div>
    </Sheet>
  );
}
