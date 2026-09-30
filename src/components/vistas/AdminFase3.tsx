'use client';
import { useCallback, useEffect, useState } from 'react';
import { DIAS, DIAS_CORTOS, ETIQUETA_ORDEN, fechaDia, fechaHora, type Tienda } from '@/lib/compras';
import { fmtPen } from '@/lib/precios-core';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useCatalogoOpcional } from '../CatalogoProvider';
import { nombreCarta } from '@/lib/catalogo';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';
import { Aviso, Campo } from '../ui';

type PagoAdmin = {
  id: string; numero: number; monto: number; estado: string; n_operacion: string | null; voucher: string | null; duplicado: boolean; creado: string; comprobante_en: string | null; motivo: string | null; revisado_en: string | null;
  comprador: { username: string; nombres: string; apellidos: string; telefono: string | null; celular_verificado_en: string | null } | null;
  tienda: { nombre: string; distrito: string } | null;
  ordenes: { id: string; numero: number; estado: string; subtotal: number; vendedor: string | null; codigo_retiro: string | null; fecha_limite: string | null; orden_items: { carta_id: string; cantidad: number; precio_pen: number; acabado: string; idioma: string; condicion: string }[] }[];
};

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false, error: 'Sin conexión' }));

/** Pagos por confirmar (voucher, número de operación, aviso de repetidos) y su historial. */
export function AdminPagos() {
  const { cat } = useCatalogoOpcional();
  const toast = useToast();
  const [estado, setEstado] = useState('revision');
  const [pagos, setPagos] = useState<PagoAdmin[] | null>(null);
  const [rechazar, setRechazar] = useState<PagoAdmin | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/pagos?estado=' + estado).then(x => x.json()).catch(() => null);
    setPagos(r?.ok ? r.pagos : []);
  }, [estado]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel('admin-pagos').on('postgres_changes', { event: '*', schema: 'public', table: 'pagos' }, () => cargar()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [cargar]);
  async function revisar(p: PagoAdmin, accion: 'confirmar' | 'rechazar', m?: string) {
    setOcupado(p.id);
    const r = await post('/api/admin/pagos', { id: p.id, accion, motivo: m });
    setOcupado(null);
    if (r.ok) { toast(accion === 'confirmar' ? `Pago #${p.numero} confirmado: vendedores avisados` : `Pago #${p.numero} rechazado`, 'ok', 3500); cargar(); }
    else toast(r.error || 'No se pudo', 'danger', 4000);
  }
  return (
    <div className="panel" data-testid="admin-pagos">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Pagos</h3>
        <div className="seg">{[['revision', 'Por confirmar'], ['confirmado', 'Confirmados'], ['rechazado', 'Rechazados'], ['pendiente', 'Sin comprobante'], ['todos', 'Todos']].map(([v, l]) => <button key={v} className={estado === v ? 'active' : ''} onClick={() => setEstado(v)}>{l}</button>)}</div>
      </div>
      <p className="small muted">Compara el voucher con el número de operación y el monto. Al confirmar, cada vendedor recibe el aviso con la ubicación de su carta y la tienda; al rechazar, el comprador recibe el motivo y las cartas vuelven al mercado.</p>
      {!pagos ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {pagos && !pagos.length ? <p className="small muted">Nada en este estado.</p> : null}
      {(pagos || []).map(p => (
        <div key={p.id} className="card-row" style={{ cursor: 'default', alignItems: 'flex-start', marginBottom: 8 }} data-testid="admin-pago">
          <div className="card-main">
            <div className="card-name">Compra #{p.numero} · <b>{fmtPen(p.monto)}</b> · @{p.comprador?.username}{p.comprador ? <span className="small muted"> ({p.comprador.nombres} {p.comprador.apellidos} · {p.comprador.telefono}{p.comprador.celular_verificado_en ? ' ✔' : ''})</span> : null}</div>
            <div className="card-set">{fechaHora(p.comprobante_en || p.creado)} · operación <b>{p.n_operacion || '—'}</b>{p.duplicado ? <span className="pill danger" style={{ marginLeft: 6 }}>⚠️ n.º de operación repetido</span> : null} · {p.tienda ? `${p.tienda.nombre}` : 'sin tienda'} · <span className="pill">{p.estado}</span>{p.motivo ? ` · ${p.motivo}` : ''}</div>
            {p.ordenes.map(o => (
              <div key={o.id} className="small" style={{ marginTop: 4 }}>
                Orden #{o.numero} · vende @{o.vendedor} · {fmtPen(o.subtotal)} · {ETIQUETA_ORDEN[o.estado as keyof typeof ETIQUETA_ORDEN] || o.estado}{o.fecha_limite ? ` · entrega hasta ${fechaDia(o.fecha_limite)}` : ''}
                <div className="muted">{o.orden_items.map(i => `${i.cantidad}× ${cat?.carta(i.carta_id) ? nombreCarta(cat.carta(i.carta_id)!, 'es') : i.carta_id}${i.idioma ? ' ' + i.idioma : ''}${i.acabado ? ' ' + i.acabado : ''}`).join(' · ')}</div>
              </div>
            ))}
            {p.estado === 'revision' ? (
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {p.voucher ? <a className="btn sm" href={p.voucher} target="_blank" rel="noreferrer">🧾 Ver voucher</a> : <span className="small muted">sin voucher</span>}
                <button className="btn sm primary" disabled={ocupado === p.id} onClick={() => revisar(p, 'confirmar')} data-testid="btn-confirmar-pago">✅ Confirmar pago</button>
                <button className="btn sm danger" disabled={ocupado === p.id} onClick={() => { setRechazar(p); setMotivo(''); }}>Rechazar…</button>
              </div>
            ) : p.voucher ? <a className="small" href={p.voucher} target="_blank" rel="noreferrer">Ver voucher</a> : null}
          </div>
          {p.voucher && p.estado === 'revision' ? /* eslint-disable-next-line @next/next/no-img-element */ <a href={p.voucher} target="_blank" rel="noreferrer"><img src={p.voucher} alt="voucher" style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} /></a> : null}
        </div>
      ))}
      {rechazar ? (
        <Sheet titulo={`Rechazar pago #${rechazar.numero}`} onClose={() => setRechazar(null)} pie={<><button className="btn" onClick={() => setRechazar(null)}>Cancelar</button><button className="btn danger" disabled={!motivo.trim()} onClick={() => { const p = rechazar; setRechazar(null); revisar(p, 'rechazar', motivo.trim()); }}>Rechazar pago</button></>}>
          <Campo label="Motivo (lo verá el comprador)">{id => <input id={id} className="input" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="El monto no coincide / el voucher no es legible…" />}</Campo>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Tiendas / sedes de entrega y sus cuentas de encargado. */
export function AdminTiendas() {
  const toast = useToast();
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const [cuentas, setCuentas] = useState<{ id: string; username: string; tienda_id: string | null }[]>([]);
  const [editar, setEditar] = useState<Partial<Tienda> | null>(null);
  const [cuenta, setCuenta] = useState<{ tienda: Tienda; username: string } | null>(null);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/tiendas').then(x => x.json()).catch(() => null); if (r?.ok) { setTiendas(r.tiendas); setCuentas(r.cuentas); } else setTiendas([]); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function guardar() {
    if (!editar) return;
    const r = await post('/api/admin/tiendas', editar);
    if (r.ok) { toast('Tienda guardada', 'ok'); setEditar(null); cargar(); } else toast(r.error || 'No se pudo guardar', 'danger');
  }
  async function asignar(quitar = false) {
    if (!cuenta) return;
    const r = await post('/api/admin/usuarios', { accion: 'rol_tienda', username: cuenta.username, tienda_id: quitar ? null : cuenta.tienda.id });
    if (r.ok) { toast(quitar ? 'Cuenta de tienda quitada' : `@${cuenta.username} ahora atiende ${cuenta.tienda.nombre}`, 'ok', 3500); setCuenta(null); cargar(); } else toast(r.error || 'No se pudo', 'danger');
  }
  const e = editar || {};
  return (
    <div className="panel" data-testid="admin-tiendas">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Tiendas de entrega</h3><button className="btn sm primary" onClick={() => setEditar({ nombre: '', distrito: '', direccion: '', referencia: '', horario: '', dias_abierto: [1, 2, 3, 4, 5, 6], activa: true })}>+ Nueva tienda</button></div>
      <p className="small muted">El vendedor deja la carta en la tienda y el comprador la recoge con su código. La cuenta de encargado (un usuario normal al que le das el rol) ve las órdenes de su sede en /tienda y marca «Recibido» y «Retirado».</p>
      {!tiendas ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {(tiendas || []).map(t => (
        <div key={t.id} className="card-row" style={{ cursor: 'default', marginBottom: 6 }} data-testid="admin-tienda">
          <div className="card-main">
            <div className="card-name">🏪 {t.nombre}{!t.activa ? <span className="pill" style={{ marginLeft: 6 }}>inactiva</span> : null}</div>
            <div className="card-set">{t.distrito} · {t.direccion}{t.referencia ? ` (${t.referencia})` : ''} · {t.horario} · abre {t.dias_abierto.map(d => DIAS_CORTOS[d]).join(' ')}</div>
            <div className="small">Encargados: {cuentas.filter(c => c.tienda_id === t.id).map(c => '@' + c.username).join(', ') || 'ninguno'} · <button className="link" onClick={() => setCuenta({ tienda: t, username: '' })}>asignar cuenta</button></div>
          </div>
          <div className="card-side"><button className="btn sm" onClick={() => setEditar(t)}>Editar</button></div>
        </div>
      ))}
      {editar ? (
        <Sheet titulo={editar.id ? 'Editar tienda' : 'Nueva tienda'} onClose={() => setEditar(null)} pie={<><button className="btn" onClick={() => setEditar(null)}>Cancelar</button><button className="btn primary" onClick={guardar} disabled={!e.nombre}>Guardar</button></>}>
          <Campo label="Nombre">{id => <input id={id} className="input" value={e.nombre || ''} onChange={x => setEditar({ ...e, nombre: x.target.value })} />}</Campo>
          <div className="row wrap"><Campo label="Distrito / ciudad">{id => <input id={id} className="input" value={e.distrito || ''} onChange={x => setEditar({ ...e, distrito: x.target.value })} />}</Campo><Campo label="Teléfono (opcional)">{id => <input id={id} className="input" value={e.telefono || ''} onChange={x => setEditar({ ...e, telefono: x.target.value })} />}</Campo></div>
          <Campo label="Dirección">{id => <input id={id} className="input" value={e.direccion || ''} onChange={x => setEditar({ ...e, direccion: x.target.value })} />}</Campo>
          <Campo label="Referencia (galería, piso, stand)">{id => <input id={id} className="input" value={e.referencia || ''} onChange={x => setEditar({ ...e, referencia: x.target.value })} />}</Campo>
          <Campo label="Horario (texto)">{id => <input id={id} className="input" value={e.horario || ''} onChange={x => setEditar({ ...e, horario: x.target.value })} placeholder="Lunes a sábado de 12:00 a 20:00" />}</Campo>
          <div className="field"><label>Días que abre</label><div className="row wrap" style={{ gap: 6 }}>{DIAS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={(e.dias_abierto || []).includes(i)} onChange={x => setEditar({ ...e, dias_abierto: x.target.checked ? [...new Set([...(e.dias_abierto || []), i])].sort() : (e.dias_abierto || []).filter(n => n !== i) })} />{d}</label>)}</div></div>
          <label className="check"><input type="checkbox" checked={e.activa !== false} onChange={x => setEditar({ ...e, activa: x.target.checked })} /> Activa (se puede elegir al comprar)</label>
        </Sheet>
      ) : null}
      {cuenta ? (
        <Sheet titulo={`Encargado de ${cuenta.tienda.nombre}`} onClose={() => setCuenta(null)} pie={<><button className="btn" onClick={() => setCuenta(null)}>Cancelar</button><button className="btn danger" disabled={!cuenta.username.trim()} onClick={() => asignar(true)}>Quitar rol</button><button className="btn primary" disabled={!cuenta.username.trim()} onClick={() => asignar(false)}>Asignar</button></>}>
          <p className="small muted">La persona primero crea su cuenta normal en la app; aquí escribes su nombre de usuario para darle el rol de tienda. Solo verá las órdenes de su sede (nunca DNI ni celulares).</p>
          <Campo label="Nombre de usuario">{id => <input id={id} className="input" autoFocus value={cuenta.username} onChange={x => setCuenta({ ...cuenta, username: x.target.value.replace(/^@/, '') })} />}</Campo>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Verificaciones de celular pendientes (llegan por WhatsApp al número de la app). */
export function AdminVerificaciones() {
  const toast = useToast();
  const [lista, setLista] = useState<{ id: string; username: string; nombres: string; apellidos: string; telefono: string; codigo_verificacion: string; codigo_verificacion_expira: string }[] | null>(null);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/usuarios').then(x => x.json()).catch(() => null); setLista(r?.ok ? r.pendientes : []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function decidir(id: string, ok: boolean) {
    const r = await post('/api/admin/usuarios', { accion: ok ? 'verificar_celular' : 'rechazar_celular', id });
    if (r.ok) { toast(ok ? 'Celular verificado' : 'Verificación rechazada', 'ok'); cargar(); } else toast(r.error || 'No se pudo', 'danger');
  }
  return (
    <div className="panel" data-testid="admin-verificaciones">
      <h3 style={{ marginTop: 0 }}>Verificación de celulares (WhatsApp)</h3>
      <p className="small muted">Cada usuario te envía por WhatsApp su código desde su celular. Comprueba que el número que te escribió es el mismo que figura aquí y pulsa «Verificar». Si el código llegó desde otro número, recházalo.</p>
      {!lista ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {lista && !lista.length ? <p className="small muted">No hay verificaciones pendientes.</p> : null}
      {(lista || []).map(u => (
        <div key={u.id} className="card-row" style={{ cursor: 'default', marginBottom: 6 }} data-testid="admin-verificacion">
          <div className="card-main">
            <div className="card-name">@{u.username} <span className="small muted">({u.nombres} {u.apellidos})</span></div>
            <div className="card-set">Celular <b>{u.telefono}</b> · código <b style={{ letterSpacing: 2 }}>{u.codigo_verificacion}</b> · vence {fechaHora(u.codigo_verificacion_expira)}</div>
          </div>
          <div className="row" style={{ gap: 6 }}><button className="btn sm primary" onClick={() => decidir(u.id, true)} data-testid="btn-verificar">✔ Verificar</button><button className="btn sm ghost" onClick={() => decidir(u.id, false)}>Rechazar</button></div>
        </div>
      ))}
    </div>
  );
}

/** Avisos por WhatsApp pendientes de enviar (etapa 1: el administrador los envía con un toque). */
export function AdminWhatsApp() {
  const toast = useToast();
  const [lista, setLista] = useState<{ id: number; titulo: string; cuerpo: string; creada: string; telefono: string | null; username: string; url: string | null }[] | null>(null);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/whatsapp').then(x => x.json()).catch(() => null); setLista(r?.ok ? r.pendientes : []); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function marcar(id: number) { const r = await post('/api/admin/whatsapp', { id }); if (r.ok) { setLista(l => (l || []).filter(x => x.id !== id)); } else toast(r.error || 'No se pudo', 'danger'); }
  return (
    <div className="panel" data-testid="admin-whatsapp">
      <h3 style={{ marginTop: 0 }}>WhatsApp por enviar</h3>
      <p className="small muted">Los avisos importantes (ventas confirmadas, cartas en tienda) también se envían por WhatsApp. Pulsa «Enviar»: se abre WhatsApp con el mensaje escrito; envíalo y marca «Enviado». (Etapa 2: envío automático con la API de Meta.)</p>
      {!lista ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {lista && !lista.length ? <p className="small muted">Nada pendiente.</p> : null}
      {(lista || []).map(n => (
        <div key={n.id} className="card-row" style={{ cursor: 'default', marginBottom: 6 }} data-testid="admin-wsp">
          <div className="card-main">
            <div className="card-name">@{n.username} · {n.telefono || 'sin celular'} <span className="small muted">· {fechaHora(n.creada)}</span></div>
            <div className="small">{n.titulo}: {n.cuerpo}</div>
          </div>
          <div className="row" style={{ gap: 6 }}>{n.url ? <a className="btn sm primary" href={n.url} target="_blank" rel="noreferrer">📲 Enviar</a> : null}<button className="btn sm" onClick={() => marcar(n.id)}>Enviado ✔</button></div>
        </div>
      ))}
    </div>
  );
}

/** Ajustes de pagos: Yape/Plin de la app, WhatsApp, plazos. */
export function AdminAjustesPagos() {
  const toast = useToast();
  const [form, setForm] = useState<{ yape_numero: string; yape_nombre: string; whatsapp: string; metodos: string[]; reserva_min: string; confirmacion_dias: string; liberacion_dias: string; dias_pago: number[] } | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    fetch('/api/admin/ajustes').then(r => r.json()).then(j => { const p = j.pagos || {}; setForm({ yape_numero: p.yape_numero || '', yape_nombre: p.yape_nombre || '', whatsapp: p.whatsapp || '', metodos: p.metodos || ['Yape', 'Plin'], reserva_min: String(p.reserva_min ?? 30), confirmacion_dias: String(p.confirmacion_dias ?? 3), liberacion_dias: String(p.liberacion_dias ?? 0), dias_pago: p.dias_pago || [0, 1, 2, 3, 4, 5, 6] }); }).catch(() => setForm(null));
  }, []);
  async function guardar() {
    if (!form) return;
    setGuardando(true);
    const r = await post('/api/admin/ajustes', { pagos: { ...form, reserva_min: Number(form.reserva_min), confirmacion_dias: Number(form.confirmacion_dias), liberacion_dias: Number(form.liberacion_dias) } });
    setGuardando(false);
    if (r.ok) toast('Ajustes de pagos guardados', 'ok'); else toast(r.error || 'No se pudo guardar', 'danger', 4000);
  }
  if (!form) return <div className="panel"><h3 style={{ marginTop: 0 }}>Pagos</h3><p className="small muted"><span className="spinner" /> Cargando…</p></div>;
  return (
    <div className="panel" data-testid="admin-ajustes-pagos">
      <h3 style={{ marginTop: 0 }}>Cobros y pagos</h3>
      <div className="form-grid">
        <Campo label="Número de Yape/Plin de la app" ayuda="Aquí pagan los compradores.">{id => <input id={id} className="input" inputMode="numeric" value={form.yape_numero} onChange={e => setForm({ ...form, yape_numero: e.target.value })} />}</Campo>
        <Campo label="Nombre que muestra Yape/Plin">{id => <input id={id} className="input" value={form.yape_nombre} onChange={e => setForm({ ...form, yape_nombre: e.target.value })} />}</Campo>
        <Campo label="WhatsApp de la app" ayuda="Para verificar celulares y enviar avisos.">{id => <input id={id} className="input" inputMode="numeric" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />}</Campo>
        <div className="field"><label>Métodos de pago</label><div className="row" style={{ gap: 10 }}>{['Yape', 'Plin'].map(m => <label key={m} className="check"><input type="checkbox" checked={form.metodos.includes(m)} onChange={e => setForm({ ...form, metodos: e.target.checked ? [...new Set([...form.metodos, m])] : form.metodos.filter(x => x !== m) })} />{m}</label>)}</div></div>
        <Campo label="Minutos para subir el comprobante" ayuda="Pasado el plazo la reserva se libera.">{id => <input id={id} className="input" inputMode="numeric" value={form.reserva_min} onChange={e => setForm({ ...form, reserva_min: e.target.value })} />}</Campo>
        <Campo label="Días para confirmar la entrega sola" ayuda="Si el comprador no confirma ni reclama.">{id => <input id={id} className="input" inputMode="numeric" value={form.confirmacion_dias} onChange={e => setForm({ ...form, confirmacion_dias: e.target.value })} />}</Campo>
        <Campo label="Días de espera para pagar al vendedor" ayuda="0 = apenas se confirma la entrega.">{id => <input id={id} className="input" inputMode="numeric" value={form.liberacion_dias} onChange={e => setForm({ ...form, liberacion_dias: e.target.value })} />}</Campo>
      </div>
      <div className="field"><label>Días en que pagas a los vendedores (Excel de retiros)</label><div className="row wrap" style={{ gap: 6 }}>{DIAS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={form.dias_pago.includes(i)} onChange={e => setForm({ ...form, dias_pago: e.target.checked ? [...new Set([...form.dias_pago, i])].sort() : form.dias_pago.filter(n => n !== i) })} />{d}</label>)}</div></div>
      <button className="btn primary" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div>
  );
}


type OrdenAdmin = { id: string; numero: number; estado: string; subtotal: number; neto_vendedor: number; codigo_retiro: string | null; fecha_limite: string | null; fecha_entrega: string | null; en_tienda_en: string | null; entregada_en: string | null; entregada_por: string | null; motivo: string | null; creada: string; foto_entrega_url: string | null;
  comprador: { username: string; telefono: string | null } | null; vendedor: { username: string; telefono: string | null } | null; tienda: { nombre: string } | null; orden_items: { carta_id: string; cantidad: number; idioma: string; acabado: string }[] };

/** Órdenes por estado; el administrador puede marcar recibida/entregada si la tienda no puede. */
export function AdminOrdenes() {
  const { cat } = useCatalogoOpcional();
  const toast = useToast();
  const [estado, setEstado] = useState('activas');
  const [ordenes, setOrdenes] = useState<OrdenAdmin[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/ordenes?estado=' + estado).then(x => x.json()).catch(() => null); setOrdenes(r?.ok ? r.ordenes : []); }, [estado]);
  useEffect(() => { cargar(); }, [cargar]);
  async function accion(o: OrdenAdmin, accion: 'en_tienda' | 'entregada') {
    setOcupado(o.id);
    const r = await post('/api/ordenes', { accion, id: o.id });
    setOcupado(null);
    if (r.ok) { toast(`Orden #${o.numero} actualizada`, 'ok'); cargar(); } else toast(r.error || 'No se pudo', 'danger', 4000);
  }
  return (
    <div className="panel" data-testid="admin-ordenes">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Órdenes</h3>
        <div className="seg">{[['activas', 'En curso'], ['entregada', 'Entregadas'], ['vencida', 'Vencidas'], ['todas', 'Todas']].map(([v, l]) => <button key={v} className={estado === v ? 'active' : ''} onClick={() => setEstado(v)}>{l}</button>)}</div>
      </div>
      {!ordenes ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {ordenes && !ordenes.length ? <p className="small muted">Ninguna.</p> : null}
      {(ordenes || []).map(o => (
        <div key={o.id} className="card-row" style={{ cursor: 'default', marginBottom: 6, alignItems: 'flex-start' }} data-testid="admin-orden">
          <div className="card-main">
            <div className="card-name">Orden #{o.numero} · {fmtPen(o.subtotal)} (neto {fmtPen(o.neto_vendedor)}) <span className="pill">{ETIQUETA_ORDEN[o.estado as keyof typeof ETIQUETA_ORDEN] || o.estado}</span></div>
            <div className="card-set">vende @{o.vendedor?.username} ({o.vendedor?.telefono}) → compra @{o.comprador?.username} ({o.comprador?.telefono}) · {o.tienda?.nombre || 'sin tienda'} · límite {fechaDia(o.fecha_limite)}{o.fecha_entrega ? ` · programada ${fechaDia(o.fecha_entrega)}` : ''}{o.codigo_retiro ? ` · código ${o.codigo_retiro}` : ''}{o.entregada_en ? ` · entregada ${fechaHora(o.entregada_en)} (${o.entregada_por})` : ''}{o.motivo ? ` · ${o.motivo}` : ''}</div>
            <div className="small muted">{o.orden_items.map(i => `${i.cantidad}× ${cat?.carta(i.carta_id) ? nombreCarta(cat.carta(i.carta_id)!, 'es') : i.carta_id}${i.idioma ? ' ' + i.idioma : ''}`).join(' · ')}</div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              {o.estado === 'pago_confirmado' ? <button className="btn sm" disabled={ocupado === o.id} onClick={() => accion(o, 'en_tienda')}>Marcar recibida en tienda</button> : null}
              {o.estado === 'en_tienda' || o.estado === 'pago_confirmado' ? <button className="btn sm" disabled={ocupado === o.id} onClick={() => accion(o, 'entregada')}>Marcar entregada</button> : null}
              {o.foto_entrega_url ? <a className="btn sm ghost" href={o.foto_entrega_url} target="_blank" rel="noreferrer">Foto de entrega</a> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
