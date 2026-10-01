'use client';
import { Icono } from '../Icono';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { nombreCarta, nombreColeccion, numLabel } from '@/lib/catalogo';
import { ETIQUETA_ORDEN, fechaDia, fechaHora, usernamesDe, type Orden, type OrdenItem, type Tienda as TiendaT } from '@/lib/compras';
import { ReclamoSheet } from '../ReclamoSheet';
import { comprimirImagen } from '@/lib/fotos';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCatalogo } from '../CatalogoProvider';
import { usePerfil } from '../PerfilProvider';
import { Sheet } from '../Sheet';
import { Thumb } from '../Thumb';
import { useToast } from '../Toast';
import { Aviso } from '../ui';

async function accionOrden(body: Record<string, unknown>) {
  return fetch('/api/ordenes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false, error: 'Sin conexión' }));
}

/** Cuenta de tienda: órdenes que llegan a la sede; "Recibido en tienda" y "Retirado" con código. */
export function Tienda() {
  const cat = useCatalogo();
  const { perfil } = usePerfil();
  const toast = useToast();
  const [tienda, setTienda] = useState<TiendaT | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [items, setItems] = useState<OrdenItem[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [retirar, setRetirar] = useState<Orden | null>(null);
  const [codigo, setCodigo] = useState('');
  const [recibir, setRecibir] = useState<Orden | null>(null);
  const [reclamar, setReclamar] = useState<Orden | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const esTienda = perfil.rol === 'tienda' || perfil.rol === 'admin';

  const cargar = useCallback(async () => {
    const sb = supabaseBrowser();
    if (perfil.tienda_id) { const { data: t } = await sb.from('tiendas').select('*').eq('id', perfil.tienda_id).maybeSingle(); setTienda((t as TiendaT) || null); }
    let q = sb.from('ordenes').select('*').in('estado', ['pago_confirmado', 'en_tienda', 'disputa', 'entregada', 'saldo_liberado', 'cancelada']).order('creada', { ascending: false }).limit(200);
    if (perfil.rol === 'tienda' && perfil.tienda_id) q = q.eq('tienda_id', perfil.tienda_id);
    const { data } = await q;
    const lista = ((data || []) as Orden[]).map(o => ({ ...o, subtotal: Number(o.subtotal) }));
    setOrdenes(lista);
    const ids = lista.map(o => o.id);
    const { data: its } = ids.length ? await sb.from('orden_items').select('*').in('orden_id', ids) : { data: [] };
    setItems((its || []) as OrdenItem[]);
    setNombres(await usernamesDe(lista.flatMap(o => [o.comprador_id, o.vendedor_id])));
  }, [perfil.tienda_id, perfil.rol]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel('tienda-' + perfil.id).on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, () => cargar()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [perfil.id, cargar]);

  if (!esTienda) return <div className="empty"><div className="big"><Icono n="tienda" tam={44} grosor={1.5} /></div>Esta página es para las cuentas de tienda. <Link href="/app/album">Volver</Link></div>;

  async function recibido(o: Orden, file?: File) {
    setOcupado(true);
    try {
      let url: string | null = null;
      if (file) {
        const blob = await comprimirImagen(file, 1600, 0.85);
        const ruta = `${perfil.id}/${o.id}-${Date.now().toString(36)}.jpg`;
        const sb = supabaseBrowser();
        const { error } = await sb.storage.from('entregas').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error(error.message);
        url = sb.storage.from('entregas').getPublicUrl(ruta).data.publicUrl;
      }
      const r = await accionOrden({ accion: 'en_tienda', id: o.id, foto: url });
      if (!r.ok) throw new Error(r.error || 'No se pudo registrar');
      toast(`Orden #${o.numero} recibida: el comprador ya tiene su código`, 'ok', 3500); setRecibir(null); cargar();
    } catch (e) { toast((e as Error).message, 'danger', 4000); }
    finally { setOcupado(false); }
  }
  async function retirado() {
    if (!retirar) return;
    setOcupado(true);
    const r = await accionOrden({ accion: 'entregada', id: retirar.id, codigo });
    setOcupado(false);
    if (r.ok) { toast(`Orden #${retirar.numero} entregada`, 'ok'); setRetirar(null); setCodigo(''); cargar(); } else toast(r.error || 'No se pudo', 'danger', 4000);
  }

  const grupos: [string, string, string][] = [['pago_confirmado', 'Por llegar', 'El vendedor las traerá hasta la fecha límite.'], ['en_tienda', 'Por retirar', 'Pide el código de retiro de 6 dígitos al comprador. Si el comprador revisa y no está conforme, registra el reclamo y guarda el sobre.'], ['disputa', 'En reclamo', 'Guarda el sobre hasta que el administrador resuelva.'], ['devolver', 'Devolver al vendedor', 'El reclamo se resolvió a favor del comprador: el vendedor pasará a recoger su sobre.'], ['entregada', 'Entregadas', '']];
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{tienda ? tienda.nombre : 'Tienda'}</h2>
      <p className="small muted">{tienda ? `${tienda.direccion}${tienda.horario ? ' · ' + tienda.horario : ''}` : perfil.rol === 'admin' ? 'Vista de administrador: todas las tiendas.' : 'Tu cuenta no tiene sede asignada.'} Aquí solo se ven nombres de usuario, cartas y códigos.</p>
      {!ordenes ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {grupos.map(([estado, titulo, ayuda]) => {
        const lista = (ordenes || []).filter(o => (estado === 'entregada' ? o.estado === 'entregada' || o.estado === 'saldo_liberado' : estado === 'devolver' ? o.estado === 'cancelada' && /^Reclamo/.test(o.motivo || '') : o.estado === estado));
        if (estado === 'devolver' && !lista.length) return null;
        return (
          <div key={estado} className="panel">
            <h3 style={{ marginTop: 0 }}>{titulo} <span className="muted">({lista.length})</span></h3>
            {ayuda ? <p className="small muted">{ayuda}</p> : null}
            {!lista.length ? <p className="small muted">Ninguna.</p> : null}
            {lista.map(o => (
              <div key={o.id} className="card-row" style={{ cursor: 'default', marginBottom: 6, alignItems: 'flex-start' }} data-testid="orden-tienda">
                <div className="card-main">
                  <div className="card-name">Orden #{o.numero} · vendedor @{nombres.get(o.vendedor_id)} → comprador @{nombres.get(o.comprador_id)} <span className="pill">{ETIQUETA_ORDEN[o.estado]}</span></div>
                  <div className="card-set">{o.fecha_entrega ? `Llega el ${fechaDia(o.fecha_entrega)} · ` : ''}límite {fechaDia(o.fecha_limite)}{o.en_tienda_en ? ` · en tienda desde ${fechaHora(o.en_tienda_en)}` : ''}{o.entregada_en ? ` · entregada ${fechaHora(o.entregada_en)}` : ''}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    {items.filter(i => i.orden_id === o.id).map(i => { const c = cat.carta(i.carta_id); const set = c ? cat.setOf(c) : undefined; return <span key={i.id} className="row" style={{ gap: 6, alignItems: 'center' }}><Thumb carta={c} set={set} /><span className="small">{i.cantidad}× {c ? nombreCarta(c, perfil.idioma_nombres) : i.carta_id} <span className="muted">{nombreColeccion(set, perfil.idioma_nombres)} {c ? numLabel(c, set) : ''}{i.idioma ? ' · ' + i.idioma : ''}{i.acabado ? ' · ' + i.acabado : ''}</span></span></span>; })}
                  </div>
                  {o.estado === 'pago_confirmado' ? <div className="row" style={{ gap: 6, marginTop: 8 }}><button className="btn sm primary" disabled={ocupado} onClick={() => setRecibir(o)} data-testid="btn-recibido"><Icono n="entrada" /> Recibido en tienda</button></div> : null}
                  {o.estado === 'en_tienda' ? <div className="row" style={{ gap: 6, marginTop: 8 }}><button className="btn sm primary" disabled={ocupado} onClick={() => { setRetirar(o); setCodigo(''); }} data-testid="btn-retirado"><Icono n="ok" /> Retirado por el comprador</button><button className="btn sm" disabled={ocupado} onClick={() => setReclamar(o)} data-testid="btn-reclamo-tienda"><Icono n="alerta" /> El comprador no está conforme</button>{o.foto_entrega_url ? <a className="btn sm ghost" href={o.foto_entrega_url} target="_blank" rel="noreferrer">Foto</a> : null}</div> : null}
                  {o.estado === 'disputa' || (o.estado === 'cancelada' && o.motivo) ? <div className="small muted" style={{ marginTop: 6 }}>{o.motivo}</div> : null}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {reclamar ? <ReclamoSheet orden={reclamar} porTienda onClose={() => setReclamar(null)} onListo={() => { setReclamar(null); cargar(); }} /> : null}
      {recibir ? (
        <Sheet titulo={`Recibir orden #${recibir.numero}`} onClose={() => setRecibir(null)} pie={<><button className="btn" onClick={() => setRecibir(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={() => input.current?.click()}><Icono n="camara" /> Con foto</button><button className="btn primary" disabled={ocupado} onClick={() => recibido(recibir)} data-testid="btn-recibido-sin-foto">Marcar recibida</button></>}>
          <p className="small muted">Revisa que las cartas coincidan con la orden. Si puedes, toma una foto de las cartas en el mostrador: quedará en el registro.</p>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files?.[0]; if (f && recibir) recibido(recibir, f); e.target.value = ''; }} />
        </Sheet>
      ) : null}
      {retirar ? (
        <Sheet titulo={`Retiro de la orden #${retirar.numero}`} onClose={() => setRetirar(null)} pie={<><button className="btn" onClick={() => setRetirar(null)}>Cancelar</button><button className="btn primary" disabled={ocupado || codigo.replace(/\D/g, '').length !== 6} onClick={retirado} data-testid="btn-confirmar-retiro">Confirmar entrega</button></>}>
          <p className="small muted">Pide al comprador (@{nombres.get(retirar.comprador_id)}) su código de retiro de 6 dígitos y escríbelo aquí.</p>
          <input className="input" inputMode="numeric" maxLength={6} style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center' }} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus data-testid="input-codigo-retiro" />
          {codigo.length === 6 ? null : <Aviso tipo="info">Sin el código no se puede entregar.</Aviso>}
        </Sheet>
      ) : null}
    </div>
  );
}
