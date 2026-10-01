'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fechaHora } from '@/lib/compras';
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
