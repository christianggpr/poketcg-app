'use client';
import { useCallback, useEffect, useState } from 'react';
import { DIAS, DIAS_CORTOS, ETIQUETA_ORDEN, fechaDia, fechaHora, urlVoucher, type Tienda } from '@/lib/compras';
import { comprimirImagen } from '@/lib/fotos';
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
          <div className="row wrap">
            <Campo label="Tarifa de recojo (S/)" ayuda="Lo que cobra la tienda al comprador al recoger; 0 = gratis. Se muestra en /tiendas y al elegir tienda.">{id => <input id={id} className="input" inputMode="decimal" style={{ maxWidth: 120 }} value={e.tarifa_recojo ?? 0} onChange={x => setEditar({ ...e, tarifa_recojo: Number(x.target.value.replace(/[^\d.]/g, '')) || 0 })} data-testid="input-tarifa-recojo" />}</Campo>
            <Campo label="Instagram (opcional)">{id => <input id={id} className="input" value={e.instagram || ''} onChange={x => setEditar({ ...e, instagram: x.target.value })} placeholder="@tienda" />}</Campo>
          </div>
          <Campo label="Enlace «Cómo llegar» (opcional)" ayuda="Pega el enlace de Google Maps de la tienda. Si lo dejas vacío se busca por la dirección.">{id => <input id={id} className="input" value={e.mapa_url || ''} onChange={x => setEditar({ ...e, mapa_url: x.target.value })} placeholder="https://maps.app.goo.gl/…" />}</Campo>
          <div className="row wrap">
            <Campo label="Latitud (opcional)" ayuda="Con latitud y longitud, /tiendas muestra un mapa. En Google Maps: clic derecho sobre el local → copiar coordenadas.">{id => <input id={id} className="input" inputMode="decimal" style={{ maxWidth: 160 }} value={e.lat ?? ''} onChange={x => setEditar({ ...e, lat: x.target.value === '' ? null : Number(x.target.value) })} placeholder="-12.0862" />}</Campo>
            <Campo label="Longitud (opcional)">{id => <input id={id} className="input" inputMode="decimal" style={{ maxWidth: 160 }} value={e.lon ?? ''} onChange={x => setEditar({ ...e, lon: x.target.value === '' ? null : Number(x.target.value) })} placeholder="-77.0346" />}</Campo>
          </div>
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
  const [form, setForm] = useState<{ yape_numero: string; yape_nombre: string; whatsapp: string; metodos: string[]; reserva_min: string; confirmacion_dias: string; liberacion_dias: string; dias_pago: number[]; modo_limite: 'sabado' | 'dias'; entrega_dias: string; plazo_fecha_horas: string; atencion: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    fetch('/api/admin/ajustes').then(r => r.json()).then(j => { const p = j.pagos || {}; setForm({ yape_numero: p.yape_numero || '', yape_nombre: p.yape_nombre || '', whatsapp: p.whatsapp || '', metodos: p.metodos || ['Yape', 'Plin'], reserva_min: String(p.reserva_min ?? 30), confirmacion_dias: String(p.confirmacion_dias ?? 3), liberacion_dias: String(p.liberacion_dias ?? 0), dias_pago: p.dias_pago || [0, 1, 2, 3, 4, 5, 6], modo_limite: p.modo_limite === 'sabado' ? 'sabado' : 'dias', entrega_dias: String(p.entrega_dias ?? 7), plazo_fecha_horas: String(p.plazo_fecha_horas ?? 48), atencion: p.atencion || 'Lunes a sábado de 10 a. m. a 8 p. m.' }); }).catch(() => setForm(null));
  }, []);
  async function guardar() {
    if (!form) return;
    setGuardando(true);
    const r = await post('/api/admin/ajustes', { pagos: { ...form, reserva_min: Number(form.reserva_min), confirmacion_dias: Number(form.confirmacion_dias), liberacion_dias: Number(form.liberacion_dias), entrega_dias: Number(form.entrega_dias), plazo_fecha_horas: Number(form.plazo_fecha_horas) } });
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
        <Campo label="Horario de atención" ayuda="Se muestra en el centro de ayuda y en la portada junto al WhatsApp.">{id => <input id={id} className="input" value={form.atencion} onChange={e => setForm({ ...form, atencion: e.target.value })} data-testid="input-atencion" />}</Campo>
        <div className="field"><label>Métodos de pago</label><div className="row" style={{ gap: 10 }}>{['Yape', 'Plin'].map(m => <label key={m} className="check"><input type="checkbox" checked={form.metodos.includes(m)} onChange={e => setForm({ ...form, metodos: e.target.checked ? [...new Set([...form.metodos, m])] : form.metodos.filter(x => x !== m) })} />{m}</label>)}</div></div>
        <Campo label="Minutos para subir el comprobante" ayuda="Pasado el plazo la reserva se libera.">{id => <input id={id} className="input" inputMode="numeric" value={form.reserva_min} onChange={e => setForm({ ...form, reserva_min: e.target.value })} />}</Campo>
        <Campo label="Plazo de entrega del vendedor" ayuda="Fase 4: por defecto N días desde que confirmas el pago.">{id => <select id={id} className="input" value={form.modo_limite} onChange={e => setForm({ ...form, modo_limite: e.target.value as 'sabado' | 'dias' })} data-testid="select-modo-limite"><option value="dias">Hasta N días después del pago</option><option value="sabado">Hasta el sábado (vie/sáb → sábado siguiente)</option></select>}</Campo>
        {form.modo_limite === 'dias' ? <Campo label="Días de plazo para entregar" ayuda="Desde que confirmas el pago.">{id => <input id={id} className="input" inputMode="numeric" value={form.entrega_dias} onChange={e => setForm({ ...form, entrega_dias: e.target.value })} data-testid="input-entrega-dias" />}</Campo> : null}
        <Campo label="Horas para que el vendedor elija la fecha" ayuda="Pasado el plazo, el comprador puede anular y recuperar su dinero.">{id => <input id={id} className="input" inputMode="numeric" value={form.plazo_fecha_horas} onChange={e => setForm({ ...form, plazo_fecha_horas: e.target.value })} />}</Campo>
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

type RetiroAdmin = { id: string; numero: number; usuario_id: string; monto: number; bruto: number; comision: number; ordenes_numeros: number[]; estado: string; n_operacion: string | null; comprobante_url: string | null; excel_generado_en: string | null; pagado_en: string | null; creado: string;
  perfil: { username: string; nombres: string; apellidos: string; dni: string | null; telefono: string | null } | null; cobro: { metodo: string; titular: string; banco: string; numero: string; cuenta: string; cci: string } | null };

/** Pagos a vendedores: pendientes con sus datos de cobro, Excel y marcar pagados. */
export function AdminRetiros() {
  const toast = useToast();
  const [estado, setEstado] = useState('pendientes');
  const [lista, setLista] = useState<RetiroAdmin[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [operacion, setOperacion] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pagando, setPagando] = useState<RetiroAdmin | null>(null);   // hoja "Pagado" de un solo pago (n.º de operación + captura)
  const [comprobante, setComprobante] = useState<{ dataUrl: string; nombre: string } | null>(null);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/retiros?estado=' + estado).then(x => x.json()).catch(() => null); setLista(r?.ok ? r.retiros : []); setSel(new Set()); }, [estado]);
  useEffect(() => { cargar(); }, [cargar]);
  async function pagar(ids: string[], conComprobante?: string | null) {
    if (!ids.length) return;
    setOcupado(true);
    const r = await post('/api/admin/retiros', { accion: 'pagado', ids, n_operacion: operacion.trim() || null, comprobante: conComprobante || null });
    setOcupado(false);
    if (r.ok) { toast(`${r.pagados} ${r.pagados === 1 ? 'pago marcado' : 'pagos marcados'} como realizados: vendedores avisados`, 'ok', 3500); setOperacion(''); setPagando(null); setComprobante(null); cargar(); } else toast(r.error || 'No se pudo', 'danger');
  }
  async function elegirComprobante(f: File | undefined) {
    if (!f) return;
    try {
      const blob = await comprimirImagen(f, 1400, 0.82);
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('No se pudo leer la imagen')); fr.readAsDataURL(blob); });
      setComprobante({ dataUrl, nombre: f.name });
    } catch (e) { toast((e as Error).message, 'danger'); }
  }
  async function verComprobante(r: RetiroAdmin) {
    const url = await urlVoucher(r.comprobante_url);
    if (url) window.open(url, '_blank', 'noopener'); else toast('No se pudo abrir el comprobante', 'danger');
  }
  async function liberar() { setOcupado(true); const r = await post('/api/admin/retiros', { accion: 'liberar' }); setOcupado(false); if (r.ok) { toast(`Saldos liberados: ${r.liberadas}`, 'ok'); cargar(); } }
  const metodo = (c: RetiroAdmin['cobro']) => !c ? 'SIN DATOS DE COBRO' : c.metodo === 'banco' ? `${c.banco} · cta ${c.cuenta} · CCI ${c.cci}` : `${c.metodo === 'yape' ? 'Yape' : 'Plin'} ${c.numero}`;
  const total = (lista || []).filter(r => r.estado !== 'pagado' && r.cobro).reduce((s, r) => s + r.monto, 0);
  return (
    <div className="panel" data-testid="admin-retiros">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Pagos a vendedores</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="seg">{[['pendientes', 'Por pagar'], ['pagado', 'Pagados'], ['todos', 'Todos']].map(([v, l]) => <button key={v} className={estado === v ? 'active' : ''} onClick={() => setEstado(v)}>{l}</button>)}</div>
          <a className="btn sm" href="/api/admin/retiros/excel" data-testid="btn-excel">⬇️ Excel del día</a>
          <button className="btn sm ghost" disabled={ocupado} onClick={liberar} title="Normalmente lo hace la tarea diaria">Liberar saldos ahora</button>
        </div>
      </div>
      <p className="small muted">Cada entrega confirmada genera (o suma a) un pago pendiente por vendedor. Cada día de pago recibes el Excel por correo; pagas por Yape/Plin o transferencia y aquí marcas «Pagado» (con el n.º de operación): el vendedor recibe el aviso.</p>
      {estado === 'pendientes' && lista?.length ? <p className="small"><b>Total por pagar hoy: {fmtPen(total)}</b>{lista.some(r => !r.cobro) ? ` · ${lista.filter(r => !r.cobro).length} sin datos de cobro (ya se les pidió)` : ''}</p> : null}
      {!lista ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {lista && !lista.length ? <p className="small muted">Nada por aquí.</p> : null}
      {(lista || []).map(r => (
        <div key={r.id} className="card-row" style={{ cursor: 'default', marginBottom: 6 }} data-testid="admin-retiro">
          {r.estado !== 'pagado' ? <input type="checkbox" className="sel" checked={sel.has(r.id)} disabled={!r.cobro} onChange={e => setSel(x => { const y = new Set(x); if (e.target.checked) y.add(r.id); else y.delete(r.id); return y; })} /> : null}
          <div className="card-main">
            <div className="card-name">Pago #{r.numero} · <b>{fmtPen(r.monto)}</b> a @{r.perfil?.username} <span className="small muted">({r.perfil?.nombres} {r.perfil?.apellidos} · DNI {r.perfil?.dni || '—'} · {r.perfil?.telefono})</span> <span className={`pill ${r.estado === 'pagado' ? 'ok' : r.cobro ? 'warn' : 'danger'}`}>{r.estado === 'pagado' ? 'pagado' : r.cobro ? 'por pagar' : 'sin datos de cobro'}</span></div>
            <div className="card-set"><b>{metodo(r.cobro)}</b>{r.cobro ? ` · titular ${r.cobro.titular}` : ''} · órdenes {r.ordenes_numeros.map(n => '#' + n).join(', ')} · bruto {fmtPen(r.bruto)} − comisión {fmtPen(r.comision)}{r.excel_generado_en ? ` · en Excel del ${fechaDia(r.excel_generado_en.slice(0, 10))}` : ''}{r.pagado_en ? ` · pagado ${fechaHora(r.pagado_en)}${r.n_operacion ? ' · op. ' + r.n_operacion : ''}` : ''}</div>
          </div>
          {r.estado !== 'pagado' && r.cobro ? <div className="card-side"><button className="btn sm primary" disabled={ocupado} onClick={() => { setPagando(r); setComprobante(null); setOperacion(r.n_operacion || ''); }} data-testid="btn-pagado">Pagado ✔</button></div> : null}
          {r.estado === 'pagado' && r.comprobante_url ? <div className="card-side"><button className="btn sm ghost" onClick={() => verComprobante(r)}>Comprobante</button></div> : null}
        </div>
      ))}
      {pagando ? (
        <Sheet titulo={`Pago #${pagando.numero} · ${fmtPen(pagando.monto)} a @${pagando.perfil?.username}`} onClose={() => setPagando(null)} pie={<><button className="btn" onClick={() => setPagando(null)}>Cancelar</button><button className="btn primary" disabled={ocupado} onClick={() => pagar([pagando.id], comprobante?.dataUrl)} data-testid="btn-confirmar-pagado">{ocupado ? 'Guardando…' : 'Confirmar pago'}</button></>}>
          <p className="small muted">Paga por {metodo(pagando.cobro)} a nombre de <b>{pagando.cobro?.titular}</b> y confirma aquí. El vendedor recibirá el aviso (app, correo y WhatsApp) con el n.º de operación y podrá ver la captura del comprobante si la adjuntas.</p>
          <Campo label="N.º de operación (opcional)">{id => <input id={id} className="input" value={operacion} onChange={e => setOperacion(e.target.value)} placeholder="Ej. 01234567" data-testid="input-operacion-pago" />}</Campo>
          <div className="field">
            <label>Captura del comprobante (opcional)</label>
            <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn sm">📷 Elegir imagen<input type="file" accept="image/*" hidden onChange={e => { elegirComprobante(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-comprobante-pago" /></label>
              {comprobante ? <span className="small">{comprobante.nombre} <button className="btn sm ghost" onClick={() => setComprobante(null)}>Quitar</button></span> : <span className="small muted">Solo la verán el vendedor y tú.</span>}
            </div>
            {comprobante ? <img src={comprobante.dataUrl} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, marginTop: 6 }} /> : null}
          </div>
        </Sheet>
      ) : null}
      {sel.size ? <div className="barra-seleccion"><span className="small"><b>{sel.size}</b> seleccionados</span><input className="input sm" style={{ maxWidth: 200 }} placeholder="N.º de operación (opcional)" value={operacion} onChange={e => setOperacion(e.target.value)} /><span className="grow" /><button className="btn sm primary" disabled={ocupado} onClick={() => pagar([...sel])}>Marcar {sel.size} como pagados</button></div> : null}
    </div>
  );
}
