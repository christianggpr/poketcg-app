'use client';
import { Icono } from '../Icono';
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
            <div className="card-name"><Link href={`/u/${encodeURIComponent(u.username)}`} target="_blank">@{u.username}</Link> <span className="small muted">{u.nombres} {u.apellidos} · {u.email}{u.dni ? ` · DNI ${u.dni}` : ''}{u.telefono ? ` · ${u.telefono}${u.celular_verificado_en ? ' (verificado)' : ''}` : ''}</span> {u.rol !== 'usuario' ? <span className="pill primary">{u.rol}</span> : null} {u.estado === 'suspendido' ? <span className="pill danger" data-testid="pill-suspendido">suspendido</span> : null}</div>
            <div className="card-set">{r.puntaje != null ? `${Number(r.puntaje).toFixed(1)} estrellas (${r.resenas})` : 'sin calificaciones'} · {r.ventas || 0} ventas · {r.faltas || 0} {r.faltas === 1 ? 'orden vencida' : 'órdenes vencidas'}{r.faltas_90 ? ` (${r.faltas_90} en 90 días)` : ''} · registrado {fechaHora(u.creado_en)}</div>
            <div style={{ marginTop: 4 }}><Insignias reputacion={r} /></div>
            {u.estado === 'suspendido' ? <div className="small" style={{ color: 'var(--peligro-texto)', marginTop: 4 }}>Suspendido {u.suspendido_en ? fechaHora(u.suspendido_en) : ''}{u.suspendido_motivo ? `: ${u.suspendido_motivo}` : ''}</div> : null}
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
            {r.fotos_url.length ? <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{r.fotos_url.map((u, k) => <a key={k} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Foto ${k + 1}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--linea)' }} /></a>)}</div> : null}
            {r.estado === 'resuelto' ? <div className="small" style={{ marginTop: 4 }}>{r.monto_devuelto ? `Devuelto ${fmtPen(r.monto_devuelto)} al saldo del comprador. ` : ''}{r.nota_admin ? `Nota: ${r.nota_admin}` : ''}</div> : null}
          </div>
          {r.estado === 'abierto' ? <div className="card-side"><button className="btn sm primary" onClick={() => { setResolver(r); setResolucion('devolver'); setMonto(''); setNota(''); }} data-testid="btn-resolver-reclamo">Resolver</button></div> : null}
        </div>
      ))}
      {resolver ? (
        <Sheet titulo={`Resolver reclamo #${resolver.numero} (orden #${resolver.orden?.numero})`} onClose={() => setResolver(null)} pie={<><button className="btn" onClick={() => setResolver(null)}>Cancelar</button><button className="btn primary" disabled={ocupado || (resolucion === 'parcial' && !(Number(monto) > 0))} onClick={enviar} data-testid="btn-confirmar-resolucion">{ocupado ? 'Guardando…' : 'Confirmar'}</button></>}>
          <div className="stack" style={{ gap: 8 }}>
            {([['devolver', `Devolver todo al comprador (${fmtPen(resolver.orden?.subtotal || 0)} a su saldo). La orden se anula, las cartas vuelven al vendedor (las recoge en la tienda) y le cuenta como falta.`], ['parcial', 'Devolución parcial: el comprador se queda con las cartas y recibe un monto a su saldo; el vendedor cobra el resto.'], ['entregar', 'No procede: la orden se entrega tal cual y el vendedor cobra.']] as const).map(([v, texto]) => (
              <label key={v} className="check" style={{ padding: 8, border: '1px solid var(--linea)', borderRadius: 10 }} data-testid={`resolucion-${v}`}><input type="radio" name="resolucion" checked={resolucion === v} onChange={() => setResolucion(v)} /><span>{texto}</span></label>
            ))}
            {resolucion === 'parcial' ? <label className="small">Monto a devolver (menor que {fmtPen(resolver.orden?.subtotal || 0)}): <input className="input" inputMode="decimal" style={{ maxWidth: 140 }} value={monto} onChange={e => setMonto(e.target.value)} data-testid="input-monto-parcial" /></label> : null}
            <label className="small">Nota para las dos partes (opcional): <input className="input" value={nota} onChange={e => setNota(e.target.value.slice(0, 500))} data-testid="input-nota-resolucion" /></label>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// C · Reportes: ventas y comisiones por día / semana / mes, top vendedores y cartas, estados; Excel
// ---------------------------------------------------------------------------------------------
type Reporte = {
  desde: string; hasta: string; grupo: 'dia' | 'semana' | 'mes';
  serie: { periodo: string; ordenes: number; ventas: number; comisiones: number; neto: number; compradores: number; vendedores: number; devoluciones: number; monto_devuelto: number }[];
  totales: { ordenes: number; ventas: number; comisiones: number; neto: number; unidades: number; compradores: number; vendedores: number; devoluciones: number; monto_devuelto: number; ticket: number; usuarios_nuevos: number; usuarios_total: number; publicaciones_activas: number; pagado_vendedores: number };
  vendedores: { id: string; username: string; ordenes: number; monto: number; comision: number; puntaje: string | null; faltas: string | null }[];
  compradores: { id: string; username: string; ordenes: number; monto: number }[];
  cartas: { carta_id: string; nombre: string; unidades: number; monto: number }[];
  estados: Record<string, number>;
  reclamos: { abiertos: number; periodo: number };
};
const ESTADO_TXT: Record<string, string> = { reservada: 'reservadas', revision: 'pago en revisión', pago_confirmado: 'pago confirmado', en_tienda: 'en tienda', entregada: 'entregadas', saldo_liberado: 'entregadas (saldo liberado)', pago_rechazado: 'pago rechazado', cancelada: 'canceladas', vencida: 'vencidas', disputa: 'en disputa' };
const hoyLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 5 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
const etiquetaPeriodo = (p: string, grupo: string) => (grupo === 'mes' ? new Date(p + '-01T12:00:00Z').toLocaleDateString('es-PE', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : new Date(p + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }));

export function AdminReportes() {
  const [desde, setDesde] = useState(diasAtras(29));
  const [hasta, setHasta] = useState(hoyLima());
  const [grupo, setGrupo] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [rep, setRep] = useState<Reporte | null>(null);
  const [error, setError] = useState('');
  const consulta = `desde=${desde}&hasta=${hasta}&grupo=${grupo}`;
  useEffect(() => {
    let vivo = true;
    setRep(null); setError('');
    fetch('/api/admin/reportes?' + consulta).then(r => r.json()).then(j => { if (!vivo) return; if (j.ok) setRep(j.reporte); else setError(j.error || 'No se pudo cargar'); }).catch(() => { if (vivo) setError('Sin conexión'); });
    return () => { vivo = false; };
  }, [consulta]);
  const preset = (d: string, h: string, g: 'dia' | 'semana' | 'mes') => { setDesde(d); setHasta(h); setGrupo(g); };
  const inicioMes = hoyLima().slice(0, 8) + '01';
  const mesPasado = (() => { const d = new Date(inicioMes + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); const ini = d.toISOString().slice(0, 10); const fin = new Date(inicioMes + 'T12:00:00Z'); fin.setUTCDate(0); return [ini, fin.toISOString().slice(0, 10)]; })();
  const max = rep ? Math.max(1, ...rep.serie.map(f => f.ventas)) : 1;
  return (
    <div className="panel" data-testid="admin-reportes">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ margin: 0 }}>Reportes de ventas</h3>
        <a className="btn sm" href={'/api/admin/reportes/excel?' + consulta} data-testid="btn-excel-reporte"><Icono n="descargar" /> Excel</a>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
        <div className="seg">
          <button className={desde === diasAtras(6) && hasta === hoyLima() ? 'active' : ''} onClick={() => preset(diasAtras(6), hoyLima(), 'dia')}>7 días</button>
          <button className={desde === diasAtras(29) && hasta === hoyLima() ? 'active' : ''} onClick={() => preset(diasAtras(29), hoyLima(), 'dia')}>30 días</button>
          <button className={desde === inicioMes && hasta === hoyLima() ? 'active' : ''} onClick={() => preset(inicioMes, hoyLima(), 'dia')}>Este mes</button>
          <button className={desde === mesPasado[0] && hasta === mesPasado[1] ? 'active' : ''} onClick={() => preset(mesPasado[0], mesPasado[1], 'dia')}>Mes pasado</button>
          <button className={desde === diasAtras(364) ? 'active' : ''} onClick={() => preset(diasAtras(364), hoyLima(), 'mes')}>12 meses</button>
        </div>
        <label className="small">Del <input type="date" className="input" style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }} value={desde} max={hasta} onChange={e => setDesde(e.target.value)} data-testid="reporte-desde" /></label>
        <label className="small">al <input type="date" className="input" style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }} value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        <div className="seg">{(['dia', 'semana', 'mes'] as const).map(g => <button key={g} className={grupo === g ? 'active' : ''} onClick={() => setGrupo(g)}>{g === 'dia' ? 'Por día' : g === 'semana' ? 'Por semana' : 'Por mes'}</button>)}</div>
      </div>
      {error ? <p className="notice danger small" style={{ marginTop: 8 }}>{error}</p> : null}
      {!rep && !error ? <p className="small muted" style={{ marginTop: 8 }}><span className="spinner" /> Calculando…</p> : null}
      {rep ? (
        <>
          <div className="stat" style={{ marginTop: 10 }} data-testid="reporte-totales">
            <div className="box"><b data-testid="reporte-ventas">{fmtPen(rep.totales.ventas)}</b><span>ventas entregadas · {rep.totales.ordenes} {rep.totales.ordenes === 1 ? 'orden' : 'órdenes'} · {rep.totales.unidades} cartas</span></div>
            <div className="box"><b data-testid="reporte-comisiones">{fmtPen(rep.totales.comisiones)}</b><span>comisiones PokéTCG · neto a vendedores {fmtPen(rep.totales.neto)}</span></div>
            <div className="box"><b>{fmtPen(rep.totales.ticket)}</b><span>ticket promedio · {rep.totales.compradores} compradores · {rep.totales.vendedores} vendedores</span></div>
            <div className="box"><b>{rep.totales.devoluciones}</b><span>devoluciones ({fmtPen(rep.totales.monto_devuelto)}) · {rep.reclamos.periodo} reclamos ({rep.reclamos.abiertos} abiertos)</span></div>
            <div className="box"><b>{rep.totales.usuarios_nuevos}</b><span>usuarios nuevos · {rep.totales.usuarios_total} en total · {rep.totales.publicaciones_activas} publicaciones activas</span></div>
            <div className="box"><b>{fmtPen(rep.totales.pagado_vendedores)}</b><span>pagado a vendedores en el período</span></div>
          </div>
          {rep.serie.length ? (
            <div className="grafico" style={{ marginTop: 12 }} data-testid="reporte-grafico" aria-label="Ventas por período">
              {rep.serie.map(f => (
                <div key={f.periodo} className="barra" title={`${f.periodo}: ${fmtPen(f.ventas)} en ${f.ordenes} órdenes · comisión ${fmtPen(f.comisiones)}`}>
                  <div className="valor small">{f.ventas ? fmtPen(f.ventas) : ''}</div>
                  <div className="relleno" style={{ height: `${Math.max(2, Math.round((f.ventas / max) * 100))}%` }}><div className="comision" style={{ height: `${f.ventas ? Math.round((f.comisiones / f.ventas) * 100) : 0}%` }} /></div>
                  <div className="eje small muted">{etiquetaPeriodo(f.periodo, rep.grupo)}</div>
                </div>
              ))}
            </div>
          ) : <p className="small muted" style={{ marginTop: 10 }}>Sin ventas entregadas en este período.</p>}
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>{Object.entries(rep.estados).map(([k, v]) => <span key={k} className="chip">{v} {ESTADO_TXT[k] || k}</span>)}</div>
          <div className="dos-columnas" style={{ marginTop: 12 }}>
            <div>
              <h4 style={{ margin: '0 0 6px' }}>Vendedores con más ventas</h4>
              {!rep.vendedores.length ? <p className="small muted">—</p> : null}
              <table className="tabla small"><tbody>{rep.vendedores.slice(0, 10).map(v => <tr key={v.id} data-testid="reporte-vendedor"><td><Link href={'/u/' + v.username} target="_blank">@{v.username}</Link>{v.faltas && Number(v.faltas) > 0 ? <span className="pill warn" style={{ marginLeft: 4 }}>{v.faltas} faltas</span> : null}</td><td className="num">{v.ordenes}</td><td className="num">{fmtPen(v.monto)}</td><td className="num muted">{v.puntaje ? Number(v.puntaje).toFixed(1) + ' estrellas' : '—'}</td></tr>)}</tbody></table>
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px' }}>Cartas más vendidas</h4>
              {!rep.cartas.length ? <p className="small muted">—</p> : null}
              <table className="tabla small"><tbody>{rep.cartas.slice(0, 10).map(c => <tr key={c.carta_id}><td><Link href={'/app/carta/' + encodeURIComponent(c.carta_id)} target="_blank">{c.nombre}</Link></td><td className="num">{c.unidades}</td><td className="num">{fmtPen(c.monto)}</td></tr>)}</tbody></table>
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px' }}>Compradores con más compras</h4>
              {!rep.compradores.length ? <p className="small muted">—</p> : null}
              <table className="tabla small"><tbody>{rep.compradores.slice(0, 10).map(v => <tr key={v.id}><td>@{v.username}</td><td className="num">{v.ordenes}</td><td className="num">{fmtPen(v.monto)}</td></tr>)}</tbody></table>
            </div>
            <div>
              <h4 style={{ margin: '0 0 6px' }}>Por {rep.grupo === 'dia' ? 'día' : rep.grupo}</h4>
              <table className="tabla small"><thead><tr><th>Período</th><th className="num">Órdenes</th><th className="num">Ventas</th><th className="num">Comisión</th><th className="num">Devol.</th></tr></thead><tbody>{rep.serie.map(f => <tr key={f.periodo}><td>{f.periodo}</td><td className="num">{f.ordenes}</td><td className="num">{fmtPen(f.ventas)}</td><td className="num">{fmtPen(f.comisiones)}</td><td className="num">{f.devoluciones || ''}</td></tr>)}</tbody></table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
