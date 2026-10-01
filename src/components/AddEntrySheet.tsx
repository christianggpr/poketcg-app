'use client';
import { Icono } from './Icono';
import { useState } from 'react';
import type { Carta } from '@/lib/catalogo';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { ACABADOS, CONDICIONES, ETIQUETA_CONDICION, IDIOMAS_CARTA, normalizarCondicion } from '@/lib/config';
import { cajasOrdenadas, type Entrada, type Personalizada } from '@/lib/coleccion';
import { sugerirDestino, type Sugerencia } from '@/lib/sugerir';
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

/** Hoja "Guardar en una caja": elige caja, cantidad, acabado, idioma… y muestra dónde colocarla. */
export function AddEntrySheet({ carta, personalizada, idiomaInicial, cajaInicial, acabadoInicial, condicionInicial, cantidadInicial, onClose, onGuardada }: Props) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const ubicador = useUbicador();
  const toast = useToast();
  const cajas = cajasOrdenadas(col.cajas);
  const set = carta ? cat.setOf(carta) : undefined;
  const [cajaId, setCajaId] = useState<string | null>(cajaInicial && cajas.some(c => c.id === cajaInicial) ? cajaInicial : col.ultimaCajaId && cajas.some(c => c.id === col.ultimaCajaId) ? col.ultimaCajaId : cajas[0]?.id || null);
  const [cantidad, setCantidad] = useState(Math.max(1, cantidadInicial || 1));
  const [acabado, setAcabado] = useState(acabadoInicial && (ACABADOS as readonly string[]).includes(acabadoInicial) ? acabadoInicial : '');
  const [idioma, setIdioma] = useState(set?.rg === 'ja' ? 'JP' : idiomaInicial && (IDIOMAS_CARTA as readonly string[]).includes(idiomaInicial) ? idiomaInicial : '');
  const [condicion, setCondicion] = useState(condicionInicial && (CONDICIONES as readonly string[]).includes(condicionInicial) ? condicionInicial : normalizarCondicion(condicionInicial));
  const [nota, setNota] = useState('');
  const [nuevaCaja, setNuevaCaja] = useState('');
  // Mejoras 1 · C3: destino = Bulk (cajaId), álbum por colección o bolsillo de un álbum personalizado; se sugiere uno
  const [destino, setDestino] = useState<'bulk' | 'coleccion' | 'album'>('bulk');
  const [albumSel, setAlbumSel] = useState<{ albumId: string; indice: number } | null>(null);
  const [sugerenciaUsada, setSugerenciaUsada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ entrada: Entrada; fusionada: boolean } | null>(null);
  const [vender, setVender] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const propias = carta ? col.entradas.filter(e => e.carta_id === carta.id) : [];
  const sugerencia: Sugerencia = carta && !carta.sd ? sugerirDestino({ cat, entradas: col.entradas, cajas: col.cajas, albumes: col.albumes, casillas: col.casillas, idiomaNombres: perfil.idioma_nombres, ultimaCajaId: col.ultimaCajaId }, carta, idioma) : null;
  function usarSugerencia() {
    if (!sugerencia) return;
    setSugerenciaUsada(true);
    if (sugerencia.tipo === 'bulk') { setDestino('bulk'); setCajaId(sugerencia.caja.id); }
    else if (sugerencia.tipo === 'coleccion') setDestino('coleccion');
    else { setDestino('album'); setAlbumSel({ albumId: sugerencia.album.id, indice: sugerencia.indice }); }
  }
  const bolsilloLibre = (albumId: string, capacidad: number) => { const ocupados = new Set(col.casillas.filter(c => c.album_id === albumId && (c.carta_id || c.entrada_id)).map(c => c.indice)); const propio = carta ? col.casillas.find(c => c.album_id === albumId && c.carta_id === carta.id && !c.entrada_id) : null; if (propio) return propio.indice; for (let i = 0; i < capacidad; i++) if (!ocupados.has(i)) return i; return -1; };

  async function crearCaja() {
    const c = await col.crearCaja({ nombre: nuevaCaja.trim() || `Bulk ${cajas.length + 1}` });
    if (c) { setDestino('bulk'); setCajaId(c.id); setNuevaCaja(''); toast('Bulk creado', 'ok'); }
  }
  async function guardar() {
    if (destino === 'bulk' && !cajaId) { toast('Crea un Bulk primero', 'danger'); return; }
    if (destino === 'album' && !albumSel) { toast('Elige un álbum', 'danger'); return; }
    setGuardando(true);
    if (destino === 'coleccion' && carta) {
      // misma carta ya en ese álbum (mismo acabado e idioma) → solo sube la cantidad
      const ya = col.entradas.find(e => e.carta_id === carta.id && e.album_coleccion === carta.s && (e.acabado || '') === acabado && (e.idioma || '') === idioma);
      if (ya) { const ok = await col.editarEntrada(ya.id, { cantidad: ya.cantidad + cantidad, nota: nota || ya.nota }); setGuardando(false); if (!ok) { toast('No se pudo guardar', 'danger'); return; } const e = col.entradas.find(x => x.id === ya.id) || { ...ya, cantidad: ya.cantidad + cantidad }; setResultado({ entrada: e, fusionada: true }); onGuardada?.(e); return; }
    }
    const r = await col.agregarEntrada({ carta_id: carta?.id || null, personalizada: carta ? null : { nombre: personalizada?.nombre || 'Carta', coleccion: personalizada?.coleccion || '', numero: personalizada?.numero || '' }, caja_id: destino === 'bulk' ? cajaId : null, cantidad, acabado, idioma, condicion, nota });
    if (r && destino === 'coleccion' && carta) await col.colocarEnColeccion(r.entrada.id, carta.s);
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

  return (
    <Sheet titulo="Guardar en mi colección" onClose={onClose} pie={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={guardar} disabled={guardando || (destino === 'bulk' && !cajaId) || (destino === 'album' && !albumSel)} data-testid="btn-guardar-entrada">{guardando ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="card-row" style={{ cursor: 'default' }}>
        <Thumb carta={carta} set={set} />
        <div className="card-main">
          <div className="card-name">{carta ? nombreCarta(carta, perfil.idioma_nombres) : personalizada?.nombre}</div>
          <div className="card-set">{carta ? <>{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(carta, set)}</span></> : <>{personalizada?.coleccion || 'Personalizada'} <span className="num">{personalizada?.numero || ''}</span></>}</div>
          {propias.length ? <div className="small" style={{ marginTop: 4 }}>Ya tienes {propias.reduce((n, e) => n + e.cantidad, 0)} en: {propias.map(e => <span key={e.id} style={{ marginRight: 6 }}><LocChip loc={ubicador.donde(e)} corto /></span>)}</div> : null}
        </div>
      </div>
      {sugerencia ? (
        <div className="sugerencia small" style={{ marginTop: 10 }} data-testid="sugerencia-guardar">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span><span className="rotulo-sug">Sugerido</span><b style={{ display: 'block' }}>{sugerencia.etiqueta}</b>{sugerencia.tipo === 'bulk' ? ` · posición #${sugerencia.posicion}` : sugerencia.tipo === 'album' ? ` · bolsillo ${sugerencia.indice + 1}` : carta ? ` · casilla ${carta.l}` : ''}</span>
            {!sugerenciaUsada ? <button className="btn sm primary" onClick={usarSugerencia} data-testid="btn-usar-sugerencia">Usar</button> : <span className="pill ok">elegida</span>}
          </div>
          <div className="muted">{sugerencia.motivo}</div>
          {'aviso' in sugerencia && sugerencia.aviso ? <div className="warn"><Icono n="alerta" tam={14} /> {sugerencia.aviso}</div> : null}
        </div>
      ) : null}
      <div className="field" style={{ marginTop: 12 }}>
        <label>Dónde</label>
        <div className="chips">
          {carta && !carta.sd ? <button className={`chipbtn ${destino === 'coleccion' ? 'active' : ''}`} onClick={() => setDestino('coleccion')} data-testid="destino-coleccion"><Icono n="album" tam={15} /> Álbum {nombreColeccion(set, perfil.idioma_nombres, true)} {idioma || (set?.rg === 'ja' ? 'JP' : 'EN')}</button> : null}
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
      <div className="row wrap">
        <Campo label="Estado">{id => <select id={id} className="input" value={condicion} onChange={e => setCondicion(e.target.value)}>{CONDICIONES.map(c => <option key={c} value={c}>{c ? ETIQUETA_CONDICION[c] || c : '—'}</option>)}</select>}</Campo>
        <div className="field grow"><label>Nota</label><input className="input" value={nota} onChange={e => setNota(e.target.value)} placeholder="opcional" /></div>
      </div>
    </Sheet>
  );
}
