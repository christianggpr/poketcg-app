'use client';
import { Icono } from './Icono';
import { useState } from 'react';
import type { Carta } from '@/lib/catalogo';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA, normalizarCondicion } from '@/lib/config';
import { cajasOrdenadas, type Entrada, type Personalizada } from '@/lib/coleccion';
import { casillaOcupada, sugerirBulk, sugerirDestino, type Alternativa, type Sugerencia } from '@/lib/sugerir';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';
import { usePrecios } from './PreciosProvider';
import { useUbicador } from './useUbicador';
import { Sheet } from './Sheet';
import { Thumb } from './Thumb';
import { Colocacion, LocChip } from './Ubicacion';
import { useToast } from './Toast';
import { Campo } from './ui';
import { fmtPen } from '@/lib/precios-core';
import { EstadoPub, PreguntaVenta, PublicarSheet } from './PublicarSheet';

type Props = { carta?: Carta | null; personalizada?: Personalizada | null; idiomaInicial?: string; cajaInicial?: string | null; acabadoInicial?: string; condicionInicial?: string; cantidadInicial?: number; onClose: () => void; onGuardada?: (e: Entrada) => void };
type Resultado = { entrada: Entrada; fusionada: boolean; repetidas?: { cantidad: number; caja: string | null } };

/**
 * Hoja "Guardar en mi colección". Mejoras 2 · B: el álbum es lo principal. Se sugiere la casilla del álbum por
 * colección si está vacía (creando el álbum si hace falta); si ya está ocupada, la carta es repetida y va al Bulk.
 * Una casilla guarda 1 copia: si se guardan varias en el álbum, 1 va a la casilla y las demás al Bulk.
 */
export function AddEntrySheet({ carta, personalizada, idiomaInicial, cajaInicial, acabadoInicial, condicionInicial, cantidadInicial, onClose, onGuardada }: Props) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const toast = useToast();
  const cajas = cajasOrdenadas(col.cajas);
  const set = carta ? cat.setOf(carta) : undefined;
  const cajaPorDefecto = cajaInicial && cajas.some(c => c.id === cajaInicial) ? cajaInicial : col.ultimaCajaId && cajas.some(c => c.id === col.ultimaCajaId) ? col.ultimaCajaId : cajas[0]?.id || null;
  const [cajaId, setCajaId] = useState<string | null>(cajaPorDefecto);
  const [cantidad, setCantidad] = useState(Math.max(1, cantidadInicial || 1));
  const [acabado, setAcabado] = useState(acabadoInicial && (ACABADOS as readonly string[]).includes(acabadoInicial) ? acabadoInicial : '');
  const [idioma, setIdioma] = useState(set?.rg === 'ja' ? 'JP' : idiomaInicial && (IDIOMAS_CARTA as readonly string[]).includes(idiomaInicial) ? idiomaInicial : '');
  const [condicion, setCondicion] = useState(condicionInicial && (CONDICIONES as readonly string[]).includes(condicionInicial) ? condicionInicial : normalizarCondicion(condicionInicial));
  const [nota, setNota] = useState('');
  const [nuevaCaja, setNuevaCaja] = useState('');
  // destino = Bulk (cajaId), álbum por colección (casilla de su número) o bolsillo de un álbum personalizado
  const [destino, setDestino] = useState<'bulk' | 'coleccion' | 'album'>('bulk');
  const [albumSel, setAlbumSel] = useState<{ albumId: string; indice: number } | null>(null);
  // Bulk para las copias de más cuando varias van al álbum (1 a la casilla, el resto al Bulk)
  const [cajaRepetidas, setCajaRepetidas] = useState<string | null>(null);
  const [sugerenciaUsada, setSugerenciaUsada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [vender, setVender] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const propias = carta ? col.entradas.filter(e => e.carta_id === carta.id) : [];
  const idiomaCarta = idioma || (set?.rg === 'ja' ? 'JP' : 'EN');
  const ctx = { cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId };
  const sugerencia: Sugerencia = carta && !carta.sd ? sugerirDestino(ctx, carta, idioma) : null;
  const ocupada = carta ? casillaOcupada(cat, col.entradas, carta, idiomaCarta) : [];
  const bulkRepetidas = carta && !carta.sd ? sugerirBulk(ctx, carta, idioma) : null;
  const cajaRep = cajaRepetidas && cajas.some(c => c.id === cajaRepetidas) ? cajaRepetidas : bulkRepetidas?.caja.id || cajaPorDefecto;
  function aplicar(s: Alternativa) {
    setSugerenciaUsada(true);
    if (s.tipo === 'bulk') { setDestino('bulk'); setCajaId(s.caja.id); }
    else if (s.tipo === 'coleccion') setDestino('coleccion');
    else if (s.tipo === 'album') { setDestino('album'); setAlbumSel({ albumId: s.album.id, indice: s.indice }); }
    else crearCaja();
  }
  const bolsilloLibre = (albumId: string, capacidad: number) => { const ocupados = new Set(col.casillas.filter(c => c.album_id === albumId && (c.carta_id || c.entrada_id)).map(c => c.indice)); const propio = carta ? col.casillas.find(c => c.album_id === albumId && c.carta_id === carta.id && !c.entrada_id) : null; if (propio) return propio.indice; for (let i = 0; i < capacidad; i++) if (!ocupados.has(i)) return i; return -1; };

  async function crearCaja() {
    const c = await col.crearCaja({ nombre: nuevaCaja.trim() || `Bulk ${cajas.length + 1}` });
    if (c) { setDestino('bulk'); setCajaId(c.id); setNuevaCaja(''); toast('Bulk creado', 'ok'); }
  }
  async function guardar() {
    if (destino === 'bulk' && !cajaId) { toast('Crea un Bulk primero', 'danger'); return; }
    if (destino === 'album' && !albumSel) { toast('Elige un álbum', 'danger'); return; }
    if (destino === 'coleccion' && ocupada.length) { toast('Esa casilla ya tiene una copia: las repetidas van al Bulk', 'danger', 3500); return; }
    setGuardando(true);
    const base = { carta_id: carta?.id || null, personalizada: carta ? null : { nombre: personalizada?.nombre || 'Carta', coleccion: personalizada?.coleccion || '', numero: personalizada?.numero || '' }, acabado, idioma, condicion, nota };
    if (destino === 'coleccion' && carta) {
      // 1 copia a la casilla; las demás al Bulk elegido (o quedan por colocar si no hay Bulk)
      const r = await col.agregarEntrada({ ...base, caja_id: null, cantidad: 1, sinFusionar: true });
      if (r) await col.colocarEnColeccion(r.entrada.id, carta.s);
      let repetidas: Resultado['repetidas'];
      if (r && cantidad > 1) {
        const extra = await col.agregarEntrada({ ...base, caja_id: cajaRep, cantidad: cantidad - 1 });
        repetidas = { cantidad: cantidad - 1, caja: extra ? cajaRep : null };
      }
      setGuardando(false);
      if (!r) { toast('No se pudo guardar', 'danger'); return; }
      setResultado({ ...r, repetidas });
      onGuardada?.(r.entrada);
      return;
    }
    const r = await col.agregarEntrada({ ...base, caja_id: destino === 'bulk' ? cajaId : null, cantidad, sinFusionar: destino === 'album' });
    if (r && destino === 'album' && albumSel) await col.colocarEnAlbum(r.entrada.id, albumSel.albumId, albumSel.indice);
    setGuardando(false);
    if (!r) { toast('No se pudo guardar', 'danger'); return; }
    setResultado(r);
    onGuardada?.(r.entrada);
  }

  if (resultado) {
    // La colección ya está actualizada: el ubicador se recalculó con la carta nueva
    const entradaRes = col.entradas.find(e => e.id === resultado.entrada.id) || resultado.entrada;
    const loc = ubicador.donde(entradaRes);
    const cajaRes = col.cajas.find(c => c.id === entradaRes.caja_id);
    const pub = col.publicacionDe(entradaRes.id);
    const esCatalogo = !!entradaRes.carta_id && !!carta && !carta.sd;
    const cajaRepRes = resultado.repetidas?.caja ? col.cajas.find(c => c.id === resultado.repetidas?.caja) : null;
    const todas = async () => {
      if (!cajaRes) return;
      setOcupado(true);
      await precios.pedir([...new Set(col.entradas.filter(e => e.caja_id === cajaRes.id && e.carta_id).map(e => e.carta_id as string))]).catch(() => {});
      const ok = await col.editarCaja(cajaRes.id, { en_venta: true });
      setOcupado(false);
      if (ok) toast('Bulk en venta: sus cartas se publicaron con el precio por defecto', 'ok', 3500); else toast('No se pudo activar la venta', 'danger');
    };
    const soloEsta = async () => {
      setOcupado(true);
      if (carta) await precios.pedir([carta.id]).catch(() => {});
      const r = await col.publicar(entradaRes.id);
      setOcupado(false);
      if (!r) { toast('No se pudo publicar', 'danger'); return; }
      if (r.estado === 'pausada' && r.motivo_pausa === 'foto') { toast('Publicada pero pausada: agrega una foto para activarla', '', 4000); setVender(true); }
      else toast(`Publicada a ${fmtPen(r.precio_pen)}`, 'ok');
    };
    const noPorAhora = async () => {
      if (!cajaRes) return;
      setOcupado(true);
      await col.editarCaja(cajaRes.id, { preguntar_venta: false });
      setOcupado(false);
      toast('No volveremos a preguntar por este Bulk. Puedes activar "Bulk en venta" cuando quieras.', '', 3500);
    };
    return (
      <>
        <Sheet titulo={resultado.fusionada ? 'Cantidad actualizada' : 'Carta guardada'} onClose={onClose} pie={<button className="btn primary block" onClick={onClose}>Listo</button>}>
          <Colocacion entrada={entradaRes} loc={loc} />
          {resultado.fusionada ? <p className="small muted" style={{ marginTop: 8 }}>Ya tenías esta carta con el mismo acabado e idioma en ese lugar: ahora hay {entradaRes.cantidad}.</p> : null}
          {resultado.repetidas ? <p className="notice info small" style={{ marginTop: 10 }} data-testid="repetidas-guardadas">La casilla guarda 1 copia. {resultado.repetidas.cantidad === 1 ? 'La otra copia' : `Las otras ${resultado.repetidas.cantidad} copias`} {cajaRepRes ? <>{resultado.repetidas.cantidad === 1 ? 'fue' : 'fueron'} a <b>{cajaRepRes.nombre}</b> como repetidas.</> : <>{resultado.repetidas.cantidad === 1 ? 'quedó' : 'quedaron'} <b>por colocar</b>: crea un Bulk para guardarlas.</>}</p> : null}
          {esCatalogo && cajaRes ? (
            pub ? (
              <div className="notice ok small" style={{ marginTop: 12 }} data-testid="publicada">
                <EstadoPub pub={pub} /> {pub.cantidad} {pub.cantidad === 1 ? 'copia' : 'copias'} en el mercado{pub.estado === 'pausada' && pub.motivo_pausa === 'foto' ? ' · pausada hasta que agregues una foto (precio mayor a S/ 50)' : ''}.
                <div style={{ marginTop: 6 }}><button className="btn sm" onClick={() => setVender(true)}>Ver o editar la publicación</button></div>
              </div>
            ) : cajaRes.en_venta ? null
            : cajaRes.preguntar_venta !== false ? <PreguntaVenta ocupado={ocupado} onTodas={todas} soloEsta={soloEsta} onNo={noPorAhora} />
            : <div className="row" style={{ marginTop: 12 }}><button className="btn sm" onClick={() => setVender(true)}><Icono n="ventas" /> Vender esta carta en el mercado</button></div>
          ) : null}
        </Sheet>
        {vender ? <PublicarSheet entrada={entradaRes} onClose={() => setVender(false)} /> : null}
      </>
    );
  }

  const detalleSug = (s: Alternativa) => (s.tipo === 'bulk' ? ` · posición #${s.posicion}` : s.tipo === 'album' ? ` · bolsillo ${s.indice + 1}` : s.tipo === 'coleccion' && carta ? ` · casilla ${carta.l}` : '');
  const nombreAlbum = `Álbum ${nombreColeccion(set, perfil.idioma_nombres, true)} ${idiomaCarta}`;
  return (
    <Sheet titulo="Guardar en mi colección" onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={guardar} disabled={guardando || (destino === 'bulk' && !cajaId) || (destino === 'album' && !albumSel) || (destino === 'coleccion' && ocupada.length > 0)} data-testid="btn-guardar-entrada">{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="card-row" style={{ cursor: 'default' }}>
        <Thumb carta={carta} set={set} idioma={idioma} />
        <div className="card-main">
          <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : personalizada?.nombre}</div>
          <div className="card-set">{carta ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(carta, set)}</span></> : <>{personalizada?.coleccion || 'Personalizada'} <span className="num">{personalizada?.numero || ''}</span></>}</div>
          {propias.length ? <div className="small" style={{ marginTop: 4 }}>Ya tienes {propias.reduce((n, e) => n + e.cantidad, 0)} en: {propias.map(e => <span key={e.id} style={{ marginRight: 6 }}><LocChip loc={ubicador.donde(e)} corto /></span>)}</div> : null}
        </div>
      </div>
      {sugerencia ? (
        <div className={`sugerencia small ${sugerencia.tipo === 'bulk' || sugerencia.tipo === 'crear-bulk' ? (sugerencia.repetida ? 'repetida' : '') : ''}`} style={{ marginTop: 10 }} data-testid="sugerencia-guardar">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span><span className="rotulo-sug">{'repetida' in sugerencia && sugerencia.repetida ? 'Repetida' : 'Sugerido'}</span><b style={{ display: 'block' }}>{sugerencia.etiqueta}</b>{detalleSug(sugerencia)}</span>
            {!sugerenciaUsada ? <button className="btn sm primary" onClick={() => aplicar(sugerencia)} data-testid="btn-usar-sugerencia">{sugerencia.tipo === 'crear-bulk' ? 'Crear un Bulk' : 'Usar'}</button> : <span className="pill ok">elegida</span>}
          </div>
          <div className="muted">{sugerencia.motivo}</div>
          {'aviso' in sugerencia && sugerencia.aviso ? <div className="warn"><Icono n="alerta" tam={14} /> {sugerencia.aviso}</div> : null}
          {'alternativas' in sugerencia && sugerencia.alternativas?.length ? (
            <div className="row wrap alternativas-sug" style={{ marginTop: 6, gap: 6 }}>
              <span className="muted">O también:</span>
              {sugerencia.alternativas.map((a, i) => <button key={i} className="btn sm ghost" onClick={() => aplicar(a)} data-testid="btn-alternativa">{a.etiqueta}{detalleSug(a)}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="field" style={{ marginTop: 12 }}>
        <label>Dónde</label>
        <div className="chips">
          {carta && !carta.sd ? <button className={`chipbtn ${destino === 'coleccion' ? 'active' : ''}`} disabled={ocupada.length > 0} onClick={() => setDestino('coleccion')} data-testid="destino-coleccion" title={ocupada.length ? 'La casilla ya tiene una copia: las repetidas van al Bulk' : undefined}><Icono n="album" tam={15} /> {nombreAlbum}{ocupada.length ? ' · casilla ocupada' : ` · casilla ${carta.l}`}</button> : null}
          {col.albumes.map(a => { const i = bolsilloLibre(a.id, a.paginas * a.columnas * a.filas); return <button key={a.id} className={`chipbtn ${destino === 'album' && albumSel?.albumId === a.id ? 'active' : ''}`} disabled={i < 0} onClick={() => { setDestino('album'); setAlbumSel({ albumId: a.id, indice: i }); }} data-testid="destino-album"><Icono n="album" tam={15} /> {a.nombre}{i >= 0 ? ` · bolsillo ${i + 1}` : ' · lleno'}</button>; })}
          {cajas.map(c => <button key={c.id} className={`chipbtn ${destino === 'bulk' && cajaId === c.id ? 'active' : ''}`} onClick={() => { setDestino('bulk'); setCajaId(c.id); }}><Icono n="bulk" tam={15} /> {c.nombre}</button>)}
        </div>
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <input className="input sm grow" placeholder={cajas.length ? 'Nuevo Bulk…' : 'Nombre de tu primer Bulk (p. ej. Bulk 1)'} value={nuevaCaja} onChange={e => setNuevaCaja(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crearCaja(); }} />
          <button className="btn sm" onClick={crearCaja}>+ Crear</button>
        </div>
      </div>
      <div className="row wrap" style={{ marginTop: 12 }}>
        <div className="field"><label>Cantidad</label><div className="stepper"><button onClick={() => setCantidad(c => Math.max(1, c - 1))}>−</button><input type="number" min={1} value={cantidad} onChange={e => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))} /><button onClick={() => setCantidad(c => c + 1)}>+</button></div></div>
        <Campo label="Acabado">{id => <select id={id} className="input" value={acabado} onChange={e => setAcabado(e.target.value)}>{ACABADOS.map(a => <option key={a} value={a}>{a || '—'}</option>)}</select>}</Campo>
        <Campo label="Idioma">{id => <select id={id} className="input" value={idioma} onChange={e => setIdioma(e.target.value)}><option value="">—</option>{IDIOMAS_CARTA.map(l => <option key={l} value={l}>{l}</option>)}</select>}</Campo>
      </div>
      {destino === 'coleccion' && cantidad > 1 ? (
        <div className="notice info small" data-testid="aviso-copias-album">
          La casilla {carta?.l} guarda 1 copia. {cantidad - 1 === 1 ? 'La otra copia va' : `Las otras ${cantidad - 1} copias van`} como repetidas a
          {cajas.length ? <> <select className="input sm" style={{ display: 'inline-block', width: 'auto', margin: '0 4px' }} value={cajaRep || ''} onChange={e => setCajaRepetidas(e.target.value)} data-testid="select-caja-repetidas">{cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></> : <b> «por colocar» (no tienes ningún Bulk todavía)</b>}.
        </div>
      ) : null}
      <div className="row wrap">
        <Campo label="Estado">{id => <select id={id} className="input" value={condicion} onChange={e => setCondicion(e.target.value)}>{CONDICIONES.map(c => <option key={c} value={c}>{c ? ETIQUETA_CONDICION[c] || c : '—'}</option>)}</select>}</Campo>
        <div className="field grow"><label>Nota</label><input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="opcional" /></div>
      </div>
    </Sheet>
  );
}
