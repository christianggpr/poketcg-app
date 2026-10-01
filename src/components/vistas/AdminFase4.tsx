'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ETIQUETA_RESOLUCION, fechaHora, MOTIVOS_RECLAMO, type Reclamo } from '@/lib/compras';
import { fmtPen } from '@/lib/precios-core';
import type { Reputacion } from '@/lib/coleccion';
import { Insignias } from '../Vendedor';
import { Sheet } from '../Sheet';
import { useToast } from '../Toast';

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false, error: 'Sin conexión' }));

type Usuario = { id: string; username: string; email: string; nombres: string; apellidos: string; dni: string | null; telefono: string | null; rol: string; estado: 'activo' | 'suspendido'; suspendido_motivo: string | null; suspendido_en: string | null; reputacion: Reputacion | null; celular_verificado_en: string | null; creado_en: string };

/** Usuarios: búsqueda, reputación y suspensión (Fase 4). */
export function AdminUsuarios() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [suspender, setSuspender] = useState<Usuario | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async (texto: string) => { const r = await fetch('/api/admin/usuarios?q=' + encodeURIComponent(texto)).then(x => x.json()).catch(() => null); setLista(r?.ok ? r.usuarios : []); }, []);
  useEffect(() => { const t = setTimeout(() => cargar(q), 300); return () => clearTimeout(t); }, [q, cargar]);
  async function confirmarSuspension() {
    if (!suspender) return;
    setOcupado(true);
    const r = await post('/api/admin/usuarios', { accion: 'suspender', id: suspender.id, motivo: motivo.trim() || null });
    setOcupado(false);
    if (r.ok) { toast(`@${suspender.username} suspendido (${r.publicaciones_pausadas} publicaciones pausadas)`, 'ok', 3500); setSuspender(null); setMotivo(''); cargar(q); } else toast(r.error || 'No se pudo', 'danger', 4000);
  }
  async function reactivar(u: Usuario) {
    setOcupado(true);
    const r = await post('/api/admin/usuarios', { accion: 'reactivar', id: u.id });
    setOcupado(false);
    if (r.ok) { toast(`@${u.username} reactivado`, 'ok'); cargar(q); } else toast(r.error || 'No se pudo', 'danger', 4000);
  }
  return (
    <div className="panel" data-testid="admin-usuarios">
      <h3 style={{ marginTop: 0 }}>Usuarios</h3>
      <p className="small muted">Busca por nombre de usuario, correo, nombres o DNI. Suspender una cuenta pausa sus publicaciones, vacía su carrito y le impide comprar o vender hasta que la reactives.</p>
      <input className="input" placeholder="Buscar usuario…" value={q} onChange={e => setQ(e.target.value)} data-testid="buscar-usuario" />
      {!lista ? <p className="small muted" style={{ marginTop: 8 }}><span className="spinner" /> Cargando…</p> : null}
      {lista && !lista.length ? <p className="small muted" style={{ marginTop: 8 }}>Sin resultados.</p> : null}
      {(lista || []).map(u => { const r = u.reputacion || {}; return (
        <div key={u.id} className="card-row" style={{ cursor: 'default', marginTop: 8 }} data-testid="admin-usuario">
          <div className="card-main">
            <div className="card-name"><Link href={`/u/${encodeURIComponent(u.username)}`} target="_blank">@{u.username}</Link> <span className="small muted">{u.nombres} {u.apellidos} · {u.email}{u.dni ? ` · DNI ${u.dni}` : ''}{u.telefono ? ` · ${u.telefono}${u.celular_verificado_en ? ' ✔' : ''}` : ''}</span> {u.rol !== 'usuario' ? <span className="pill primary">{u.rol}</span> : null} {u.estado === 'suspendido' ? <span className="pill danger" data-testid="pill-suspendido">suspendido</span> : null}</div>
            <div className="card-set">{r.puntaje != null ? `★ ${Number(r.puntaje).toFixed(1)} (${r.resenas})` : 'sin calificaciones'} · {r.ventas || 0} ventas · {r.faltas || 0} {r.faltas === 1 ? 'orden vencida' : 'órdenes vencidas'}{r.faltas_90 ? ` (${r.faltas_90} en 90 días)` : ''} · registrado {fechaHora(u.creado_en)}</div>
            <div style={{ marginTop: 4 }}><Insignias reputacion={r} /></div>
            {u.estado === 'suspendido' ? <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>Suspendido {u.suspendido_en ? fechaHora(u.suspendido_en) : ''}{u.suspendido_motivo ? `: ${u.suspendido_motivo}` : ''}</div> : null}
          </div>
          <div className="card-side">
            {u.rol === 'admin' ? null : u.estado === 'suspendido'
              ? <button className="btn sm primary" disabled={ocupado} onClick={() => reactivar(u)} data-testid="btn-reactivar">Reactivar</button>
              : <button className="btn sm danger" disabled={ocupado} onClick={() => { setSuspender(u); setMotivo(''); }} data-testid="btn-suspender">Suspender</button>}
          </div>
        </div>
      ); })}
      {suspender ? (
        <Sheet titulo={`Suspender a @${suspender.username}`} onClose={() => setSuspender(null)} pie={<><button className="btn" onClick={() => setSuspender(null)}>Cancelar</button><button className="btn danger" disabled={ocupado} onClick={confirmarSuspension} data-testid="btn-confirmar-suspension">Suspender cuenta</button></>}>
          <p className="small muted">El usuario recibirá un aviso (app y correo) con el motivo. Podrás reactivarlo cuando quieras.</p>
          <input className="input" placeholder="Motivo (lo verá el usuario)" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} data-testid="input-motivo-suspension" />
        </Sheet>
      ) : null}
    </div>
  );
}


type ReclamoAdmin = Reclamo & { fotos_url: string[]; comprador: string; vendedor: string; orden: { numero: number; estado: string; subtotal: number; neto_vendedor: number } | null; items: { carta_id: string; cantidad: number; precio_pen: number; idioma: string; acabado: string; condicion: string }[] };

/** Reclamos (Fase 4 · B): fotos, detalle y resolución (devolver, entregar, parcial). */
export function AdminReclamos() {
  const toast = useToast();
  const [estado, setEstado] = useState('abierto');
  const [lista, setLista] = useState<ReclamoAdmin[] | null>(null);
  const [resolver, setResolver] = useState<ReclamoAdmin | null>(null);
  const [resolucion, setResolucion] = useState<'devolver' | 'entregar' | 'parcial'>('devolver');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/reclamos?estado=' + estado).then(x => x.json()).catch(() => null); setLista(r?.ok ? r.reclamos.map((x: ReclamoAdmin) => ({ ...x, numero: Number(x.numero), orden: x.orden ? { ...x.orden, subtotal: Number(x.orden.subtotal), neto_vendedor: Number(x.orden.neto_vendedor) } : null })) : []); }, [estado]);
  useEffect(() => { cargar(); }, [cargar]);
  async function enviar() {
    if (!resolver) return;
    setOcupado(true);
    const r = await post('/api/admin/reclamos', { id: resolver.id, resolucion, monto: resolucion === 'parcial' ? Number(monto) : null, nota: nota.trim() });
    setOcupado(false);
    if (r.ok) { toast(`Reclamo #${resolver.numero} resuelto: ${ETIQUETA_RESOLUCION[resolucion]}`, 'ok', 4000); setResolver(null); setNota(''); setMonto(''); cargar(); } else toast(r.error || 'No se pudo', 'danger', 5000);
  }
  return (
    <div className="panel" data-testid="admin-reclamos">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Reclamos</h3>
        <div className="seg">{[['abierto', 'Abiertos'], ['resuelto', 'Resueltos'], ['todos', 'Todos']].map(([v, l]) => <button key={v} className={estado === v ? 'active' : ''} onClick={() => setEstado(v)}>{l}</button>)}</div>
      </div>
      <p className="small muted">El comprador (o la tienda por él) reclama antes de llevarse las cartas; mientras tanto la orden queda en disputa y el pago al vendedor en espera. Decide con las fotos y, si hace falta, escribe a las dos partes por WhatsApp.</p>
      {!lista ? <p className="small muted"><span className="spinner" /> Cargando…</p> : null}
      {lista && !lista.length ? <p className="small muted">Nada por aquí.</p> : null}
      {(lista || []).map(r => (
        <div key={r.id} className="card-row" style={{ cursor: 'default', marginBottom: 6, alignItems: 'flex-start' }} data-testid="admin-reclamo">
          <div className="card-main">
            <div className="card-name">Reclamo #{r.numero} · orden #{r.orden?.numero} · {fmtPen(r.orden?.subtotal || 0)} <span className={`pill ${r.estado === 'abierto' ? 'warn' : 'ok'}`}>{r.estado === 'abierto' ? 'abierto' : 'resuelto: ' + (r.resolucion ? ETIQUETA_RESOLUCION[r.resolucion] : '')}</span></div>
            <div className="card-set">{MOTIVOS_RECLAMO[r.motivo]} · abierto por {r.abierto_por} · comprador @{r.comprador} · vendedor @{r.vendedor} · {fechaHora(r.creado)}</div>
            {r.detalle ? <div className="small" style={{ marginTop: 4 }}>«{r.detalle}»</div> : null}
            <div className="small muted" style={{ marginTop: 4 }}>{r.items.map((i, k) => <span key={k}>{i.cantidad}× {i.carta_id}{i.idioma ? ' · ' + i.idioma : ''}{i.condicion ? ' · ' + i.condicion : ''} ({fmtPen(i.precio_pen)}){k < r.items.length - 1 ? '; ' : ''}</span>)}</div>
            {r.fotos_url.length ? <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{r.fotos_url.map((u, k) => <a key={k} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Foto ${k + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} /></a>)}</div> : null}
            {r.estado === 'resuelto' ? <div className="small" style={{ marginTop: 4 }}>{r.monto_devuelto ? `Devuelto ${fmtPen(r.monto_devuelto)} al saldo del comprador. ` : ''}{r.nota_admin ? `Nota: ${r.nota_admin}` : ''}</div> : null}
          </div>
          {r.estado === 'abierto' ? <div className="card-side"><button className="btn sm primary" onClick={() => { setResolver(r); setResolucion('devolver'); setMonto(''); setNota(''); }} data-testid="btn-resolver-reclamo">Resolver</button></div> : null}
        </div>
      ))}
      {resolver ? (
        <Sheet titulo={`Resolver reclamo #${resolver.numero} (orden #${resolver.orden?.numero})`} onClose={() => setResolver(null)} pie={<><button className="btn" onClick={() => setResolver(null)}>Cancelar</button><button className="btn primary" disabled={ocupado || (resolucion === 'parcial' && !(Number(monto) > 0))} onClick={enviar} data-testid="btn-confirmar-resolucion">{ocupado ? 'Guardando…' : 'Confirmar'}</button></>}>
          <div className="stack" style={{ gap: 8 }}>
            {([['devolver', `Devolver todo al comprador (${fmtPen(resolver.orden?.subtotal || 0)} a su saldo). La orden se anula, las cartas vuelven al vendedor (las recoge en la tienda) y le cuenta como falta.`], ['parcial', 'Devolución parcial: el comprador se queda con las cartas y recibe un monto a su saldo; el vendedor cobra el resto.'], ['entregar', 'No procede: la orden se entrega tal cual y el vendedor cobra.']] as const).map(([v, texto]) => (
              <label key={v} className="check" style={{ padding: 8, border: '1px solid var(--line)', borderRadius: 10 }} data-testid={`resolucion-${v}`}><input type="radio" name="resolucion" checked={resolucion === v} onChange={() => setResolucion(v)} /><span>{texto}</span></label>
            ))}
            {resolucion === 'parcial' ? <label className="small">Monto a devolver (menor que {fmtPen(resolver.orden?.subtotal || 0)}): <input className="input" inputMode="decimal" style={{ maxWidth: 140 }} value={monto} onChange={e => setMonto(e.target.value)} data-testid="input-monto-parcial" /></label> : null}
            <label className="small">Nota para las dos partes (opcional): <input className="input" value={nota} onChange={e => setNota(e.target.value.slice(0, 500))} data-testid="input-nota-resolucion" /></label>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
