'use client';
import { Icono } from './Icono';
import { useEffect, useRef, useState } from 'react';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import type { Entrada, Publicacion } from '@/lib/coleccion';
import { fmtPen, netoVendedor, redondear } from '@/lib/precios-core';
import { subirFoto, borrarFotos } from '@/lib/fotos';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';
import { usePrecios } from './PreciosProvider';
import { Sheet, Confirmar } from './Sheet';
import { Thumb } from './Thumb';
import { useToast } from './Toast';
import { Aviso } from './ui';

/** Hoja "Vender en el mercado": publica una entrada o edita su publicación (precio, cantidad, fotos, estado). */
export function PublicarSheet({ entrada, onClose }: { entrada: Entrada; onClose: () => void }) {
  const cat = useCatalogo();
  const col = useColeccion();
  const { perfil } = usePerfil();
  const precios = usePrecios();
  const toast = useToast();
  const carta = cat.carta(entrada.carta_id);
  const set = carta ? cat.setOf(carta) : undefined;
  const actual = col.entradas.find(e => e.id === entrada.id) || entrada;
  const pub = col.publicacionDe(entrada.id);
  const defecto = precios.precioDefecto(carta, actual.acabado);
  const [cantidad, setCantidad] = useState(pub?.cantidad ?? actual.cantidad);
  const [tipo, setTipo] = useState<'defecto' | 'manual'>(pub?.tipo_precio || 'defecto');
  const [manual, setManual] = useState(pub?.tipo_precio === 'manual' ? String(pub.precio_pen) : String(defecto.pen));
  const [masBajo, setMasBajo] = useState<{ precio: number; vendedor: string } | null | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [retirar, setRetirar] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const comision = precios.ajustes.comision;

  useEffect(() => { if (carta && !carta.sd) precios.pedir([carta.id]); }, [carta, precios]);
  // precio más bajo en la red para la misma carta / idioma / acabado / condición (sin contar las mías)
  useEffect(() => {
    if (!carta) return;
    let vivo = true;
    supabaseBrowser().from('mercado').select('precio_pen, vendedor').eq('carta_id', carta.id).eq('idioma', actual.idioma || '').eq('acabado', actual.acabado || '').eq('condicion', actual.condicion || '').neq('vendedor_id', perfil.id).order('precio_pen').limit(1).maybeSingle()
      .then(({ data }) => { if (vivo) setMasBajo(data ? { precio: Number(data.precio_pen), vendedor: data.vendedor } : null); });
    return () => { vivo = false; };
  }, [carta, actual.idioma, actual.acabado, actual.condicion, perfil.id]);

  if (!carta || carta.sd) return <Sheet titulo="Vender en el mercado" onClose={onClose}><p className="muted">Solo se pueden publicar cartas del catálogo.</p></Sheet>;

  const precioManual = Number(manual.replace(',', '.'));
  const precioFinal = tipo === 'manual' ? precioManual : defecto.pen;
  const mercado = defecto.mercado;
  const desvio = mercado && tipo === 'manual' && precioManual > 0 ? (precioManual - mercado.pen) / mercado.pen : 0;
  const necesitaFoto = precioFinal > 50 && !(pub?.fotos?.length);

  async function guardar() {
    if (tipo === 'manual' && (!isFinite(precioManual) || precioManual < 0.5)) { toast('El precio manual mínimo es S/ 0.50', 'danger'); return; }
    setGuardando(true);
    if (carta) await precios.pedir([carta.id]).catch(() => {});
    const r = pub
      ? await col.editarPublicacion(pub.id, { cantidad, tipo_precio: tipo, precio_pen: tipo === 'manual' ? redondear(precioManual) : 0, estado: pub.estado === 'pausada' && pub.motivo_pausa !== 'foto' ? 'pausada' : 'activa' })
      : await col.publicar(entrada.id, { cantidad, tipo_precio: tipo, precio_pen: tipo === 'manual' ? redondear(precioManual) : 0 });
    setGuardando(false);
    if (!r) { toast('No se pudo guardar la publicación', 'danger'); return; }
    if (r.estado === 'pausada' && r.motivo_pausa === 'foto') toast('Publicada pero pausada: agrega una foto para activarla', '', 4000);
    else toast(pub ? 'Publicación actualizada' : `Publicada a ${fmtPen(r.precio_pen)}`, 'ok');
    if (!(r.estado === 'pausada' && r.motivo_pausa === 'foto')) onClose();
  }
  async function agregarFoto(file: File) {
    if (!pub) { toast('Primero publica la carta; luego agrega la foto', 'danger'); return; }
    if ((pub.fotos || []).length >= 4) { toast('Máximo 4 fotos por publicación'); return; }
    setSubiendo(true);
    try {
      const url = await subirFoto(perfil.id, pub.id, file);
      const r = await col.editarPublicacion(pub.id, { fotos: [...(pub.fotos || []), url] });
      if (r?.estado === 'activa') toast('Foto agregada: publicación activa', 'ok'); else toast('Foto agregada', 'ok');
    } catch (e) { toast('No se pudo subir la foto: ' + (e as Error).message, 'danger'); }
    finally { setSubiendo(false); }
  }
  async function quitarFoto(url: string) {
    if (!pub) return;
    await borrarFotos([url]).catch(() => {});
    await col.editarPublicacion(pub.id, { fotos: (pub.fotos || []).filter(f => f !== url) });
  }
  async function cambiar(estado: 'activa' | 'pausada' | 'retirada') {
    if (!pub) return;
    const n = await col.cambiarEstado([pub.id], estado);
    if (n) { toast(estado === 'retirada' ? 'Publicación retirada' : estado === 'pausada' ? 'Publicación pausada' : 'Publicación activa', 'ok'); if (estado === 'retirada') onClose(); }
  }

  return (
    <>
      <Sheet titulo={pub ? 'Tu publicación' : 'Vender en el mercado'} onClose={onClose}
        pie={<>{pub ? <button className="btn danger" onClick={() => setRetirar(true)}>Retirar</button> : null}<span className="grow" /><button className="btn" onClick={onClose}>Cerrar</button><button className="btn primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : pub ? 'Guardar cambios' : 'Publicar'}</button></>}>
        <div className="card-row" style={{ cursor: 'default' }}>
          <Thumb carta={carta} set={set} />
          <div className="card-main">
            <div className="card-name">{nombreCarta(carta, perfil.idioma_nombres)}</div>
            <div className="card-set">{nombreColeccion(set, perfil.idioma_nombres)} <span className="num">{numLabel(carta, set)}</span>{actual.acabado ? <span className="pill">{actual.acabado}</span> : null}{actual.idioma ? <span className="pill">{actual.idioma}</span> : null}{actual.condicion ? <span className="pill">{actual.condicion}</span> : null}</div>
            {pub ? <div className="small" style={{ marginTop: 4 }}><span className={`pill ${pub.estado === 'activa' ? 'primary' : ''}`}>{pub.estado === 'activa' ? 'Activa' : pub.estado === 'pausada' ? 'Pausada' : pub.estado}</span> {pub.cantidad} {pub.cantidad === 1 ? 'copia' : 'copias'} a {fmtPen(pub.precio_pen)} ({pub.tipo_precio === 'manual' ? 'precio manual' : 'precio por defecto'})</div> : null}
          </div>
        </div>
        {pub?.aviso ? <Aviso tipo="warn">{pub.aviso}</Aviso> : null}

        <div className="field" style={{ marginTop: 12 }}><label>Copias en venta (tienes {actual.cantidad})</label>
          <div className="stepper"><button onClick={() => setCantidad(c => Math.max(1, c - 1))}>−</button><input type="number" min={1} max={actual.cantidad} value={cantidad} onChange={e => setCantidad(Math.max(1, Math.min(actual.cantidad, parseInt(e.target.value, 10) || 1)))} /><button onClick={() => setCantidad(c => Math.min(actual.cantidad, c + 1))}>+</button></div>
        </div>
        <div className="field"><label>Precio por copia</label>
          <div className="stack">
            <label className="check"><input type="radio" name="tipo" checked={tipo === 'defecto'} onChange={() => setTipo('defecto')} /><span><b>Precio por defecto: {fmtPen(defecto.pen)}</b> <span className="muted">({defecto.origen === 'piso' ? `piso de ${fmtPen(defecto.piso)}` : 'precio de mercado de hoy'}; se actualiza solo cada día)</span></span></label>
            <label className="check"><input type="radio" name="tipo" checked={tipo === 'manual'} onChange={() => setTipo('manual')} /><span><b>Precio manual</b></span></label>
            {tipo === 'manual' ? <div className="row" style={{ gap: 6, alignItems: 'center' }}><span>S/</span><input className="input" inputMode="decimal" style={{ maxWidth: 140 }} value={manual} onChange={e => setManual(e.target.value)} /><button className="btn sm ghost" onClick={() => { setTipo('defecto'); setManual(String(defecto.pen)); }}>Volver al precio por defecto</button></div> : null}
          </div>
        </div>
        <div className="small" style={{ lineHeight: 1.7 }}>
          <div>Precio de mercado hoy: <b>{mercado ? fmtPen(mercado.pen) : 'sin precio'}</b>{mercado ? <span className="muted"> ({mercado.label}{mercado.approx ? ' aprox.' : ''} · {mercado.src})</span> : null}</div>
          <div>Precio más bajo en la red (misma carta, idioma, acabado y estado): <b>{masBajo === undefined ? '…' : masBajo ? `${fmtPen(masBajo.precio)} (@${masBajo.vendedor})` : 'nadie más la vende'}</b></div>
          <div>Recibirás <b>{fmtPen(netoVendedor(precioFinal || 0, comision))}</b> por copia <span className="muted">(precio − {Math.round(comision * 100)} % de comisión)</span></div>
          {tipo === 'manual' && mercado && Math.abs(desvio) >= 0.3 ? <Aviso tipo="warn">Tu precio está {desvio > 0 ? 'un ' + Math.round(desvio * 100) + ' % por encima' : 'un ' + Math.round(-desvio * 100) + ' % por debajo'} del precio de mercado.</Aviso> : null}
          {necesitaFoto ? <Aviso tipo="info">Por encima de S/ 50 la foto real de la carta es obligatoria: la publicación quedará pausada hasta que la agregues.</Aviso> : null}
        </div>

        <div className="field" style={{ marginTop: 10 }}><label>Fotos de la carta {precioFinal > 50 ? '(obligatoria)' : '(opcional, máx. 4)'}</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {(pub?.fotos || []).map(u => (
              <div key={u} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" style={{ width: 72, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--linea)' }} />
                <button className="btn sm ghost" style={{ position: 'absolute', top: -6, right: -6 }} onClick={() => quitarFoto(u)} aria-label="Quitar foto"><Icono n="cerrar" tam={14} /></button>
              </div>
            ))}
            <button className="btn sm" disabled={!pub || subiendo} onClick={() => archivo.current?.click()}>{subiendo ? 'Subiendo…' : <><Icono n="camara" /> Agregar foto</>}</button>
            <input ref={archivo} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f) agregarFoto(f); e.target.value = ''; }} />
          </div>
          {!pub ? <div className="small muted">Podrás agregar fotos después de publicar.</div> : null}
        </div>

        {pub ? (
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {pub.estado === 'activa' ? <button className="btn sm" onClick={() => cambiar('pausada')}>Pausar</button> : null}
            {pub.estado === 'pausada' && pub.motivo_pausa !== 'foto' ? <button className="btn sm" onClick={() => cambiar('activa')}>Activar</button> : null}
          </div>
        ) : null}
      </Sheet>
      {retirar ? <Confirmar titulo="Retirar publicación" texto="La carta deja de estar en venta (sigue en tu colección) y sus fotos se borran." okLabel="Retirar" peligro onOk={() => { setRetirar(false); cambiar('retirada'); }} onClose={() => setRetirar(false)} /> : null}
    </>
  );
}

/** Etiqueta con el estado de una publicación (en venta S/ X · pausada · reservada). */
export function EstadoPub({ pub, conPrecio = true, entrada }: { pub: Publicacion | undefined | null; conPrecio?: boolean; entrada?: Entrada | null }) {
  if (!pub) return null;
  // Mejoras 2 · C: en un álbum, las copias repetidas que se venden "están en el álbum, para vender" (la casilla se queda con 1)
  const parcial = entrada && entrada.album_coleccion && pub.cantidad < entrada.cantidad ? `${pub.cantidad} ${pub.cantidad === 1 ? 'copia' : 'copias'} en el álbum, para vender · ` : '';
  if (pub.estado === 'activa') return <span className="pill ok" title={parcial ? `${parcial}la otra se queda en la casilla` : 'Publicada en el mercado'}>{parcial ? `${pub.cantidad} para vender` : 'en venta'}{conPrecio ? ` ${fmtPen(pub.precio_pen)}` : ''}</span>;
  if (pub.estado === 'pausada') return <span className="pill warn" title={pub.motivo_pausa === 'foto' ? 'Pausada: falta la foto' : 'Pausada'}><Icono n="pausa" tam={12} /> pausada{pub.motivo_pausa === 'foto' ? ' (falta foto)' : ''}</span>;
  if (pub.estado === 'reservada') return <span className="pill primary"><Icono n="candado" tam={12} /> reservada</span>;
  return null;
}

/** Pregunta "¿subir a la nube para vender?" con las tres respuestas de la Fase 2. */
export function PreguntaVenta({ titulo = '¿Quieres subir las cartas de este Bulk a la nube para venderlas en el mercado?', detalle, onTodas, onElegir, onNo, elegirLabel = 'Elegir cuáles', soloEsta, ocupado }: { titulo?: string; detalle?: React.ReactNode; onTodas: () => void; onElegir?: () => void; onNo: () => void; elegirLabel?: string; soloEsta?: () => void; ocupado?: boolean }) {
  return (
    <div className="notice info" style={{ marginTop: 12 }} data-testid="pregunta-venta">
      <b>{titulo}</b>
      <div className="small muted" style={{ margin: '4px 0 8px' }}>{detalle || 'Se publican con el precio por defecto (el mayor entre el piso y el precio de mercado); podrás cambiar precios, pausar o retirar cuando quieras. Los compradores solo ven tu nombre de usuario.'}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm primary" disabled={ocupado} onClick={onTodas}>Sí, todas</button>
        {soloEsta ? <button className="btn sm" disabled={ocupado} onClick={soloEsta}>Solo esta carta</button> : null}
        {onElegir ? <button className="btn sm" disabled={ocupado} onClick={onElegir}>{elegirLabel}</button> : null}
        <button className="btn sm ghost" disabled={ocupado} onClick={onNo}>No por ahora</button>
      </div>
    </div>
  );
}
