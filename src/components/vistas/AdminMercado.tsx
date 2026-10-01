'use client';
import { useCallback, useEffect, useState } from 'react';
import { fmtPen, type Ajustes } from '@/lib/precios-core';
import { Aviso, haceCuanto } from '../ui';
import { useToast } from '../Toast';

type Tarea = { id: number; nombre: string; inicio: string; fin: string | null; estado: 'en_curso' | 'ok' | 'error'; detalle: Record<string, unknown>; bloqueo_hasta: string | null };

/** Panel de administración de la Fase 2: ajustes del mercado y registro de la tarea diaria. */
export function AdminMercado() {
  const toast = useToast();
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [cronOk, setCronOk] = useState<boolean | null>(null);
  const [form, setForm] = useState({ normal: '1', especial: '2', comision: '5', usd_pen: '3.75', eur_pen: '4.20' });
  const [guardando, setGuardando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [salida, setSalida] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    const [a, t] = await Promise.all([fetch('/api/admin/ajustes').then(r => r.json()).catch(() => null), fetch('/api/admin/tareas').then(r => r.json()).catch(() => null)]);
    if (a && a.ok) {
      setAjustes(a.ajustes);
      const resp = (a.filas as { clave: string; valor: Record<string, number> }[]).find(f => f.clave === 'fx_respaldo')?.valor;
      setForm({ normal: String(a.ajustes.pisos.normal), especial: String(a.ajustes.pisos.especial), comision: String(Math.round(a.ajustes.comision * 10000) / 100), usd_pen: String(resp?.usd_pen ?? 3.75), eur_pen: String(resp?.eur_pen ?? 4.2) });
    }
    if (t && t.ok) { setTareas(t.tareas); setCronOk(t.cronConfigurado); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    const r = await fetch('/api/admin/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pisos: { normal: Number(form.normal), especial: Number(form.especial) }, comision: Number(form.comision) / 100, fx_respaldo: { usd_pen: Number(form.usd_pen), eur_pen: Number(form.eur_pen) } }) });
    const j = await r.json().catch(() => ({}));
    setGuardando(false);
    if (j.ok) { setAjustes(j.ajustes); toast('Ajustes guardados', 'ok'); } else toast(j.error || 'No se pudo guardar', 'danger');
  }
  async function renovarFx() {
    const r = await fetch('/api/admin/ajustes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renovarFx: true }) });
    const j = await r.json().catch(() => ({}));
    if (j.ok && j.renovado) toast(`Tipo de cambio actualizado: US$1 = S/ ${j.fx.usd_pen}`, 'ok'); else toast('No se pudo descargar el cambio' + (j.error ? ': ' + j.error : ''), 'danger');
    cargar();
  }
  async function ejecutar(forzar: boolean) {
    setEjecutando(true); setSalida([]);
    let vueltas = 0;
    try {
      // cada llamada trabaja hasta 50 s; se repite mientras quede trabajo (máximo 10 vueltas desde aquí)
      while (vueltas++ < 10) {
        const r = await fetch(`/api/tareas/tick${forzar && vueltas === 1 ? '?forzar=1' : ''}`, { method: 'POST' });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) { setSalida(s => [...s, 'Error: ' + (j.error || r.status)]); break; }
        setSalida(s => [...s, `Vuelta ${vueltas}: ${(j.hecho || []).join(', ') || (j.ocupado ? 'otro proceso está trabajando' : 'nada pendiente')}`]);
        if (!j.pendiente) break;
        if (j.ocupado) await new Promise(res => setTimeout(res, 5000));
      }
    } finally {
      setEjecutando(false);
      cargar();
    }
  }

  const fechaLima = (ms: number) => new Date(ms).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const fx = ajustes?.fx;
  const fxEdadH = fx?.t ? (Date.now() - fx.t) / 36e5 : null;
  const fxViejo = fxEdadH == null || fxEdadH > 48;

  return (
    <>
      <div className="panel">
        <h3>Mercado: tipo de cambio, pisos y comisión</h3>
        {ajustes && fxViejo ? <Aviso tipo="danger"><b>El tipo de cambio no se actualiza desde hace {fxEdadH == null ? 'nunca' : Math.floor(fxEdadH / 24) + ' días'}.</b> Se está usando el último valor conocido ({fx?.fuente || 'respaldo'}). Pulsa «Descargar ahora»; si vuelve a fallar, revisa que la tarea diaria esté corriendo (abajo).</Aviso> : null}
        {fx ? (
          <div className="small" style={{ marginBottom: 8 }} data-testid="fx-vigente">
            Tipo de cambio vigente: <b>US$1 = S/ {fx.usd_pen.toFixed(3)} · €1 = S/ {fx.eur_pen.toFixed(3)}</b>
            <div className="muted">Última actualización: <b data-testid="fx-fecha">{fx.t ? `${fechaLima(fx.t)} (hora de Lima, ${haceCuanto(new Date(fx.t).toISOString())})` : 'nunca'}</b> · fuente: {fx.fuente || '—'}. Se descarga cada día a las 00:00 de Lima en la tarea diaria (aunque no haya precios que renovar); si falla, se conserva el último valor. <button className="link" onClick={renovarFx} data-testid="btn-renovar-fx">Descargar ahora</button></div>
            {fx.ultimo_error ? <div className="estado-error" data-testid="fx-error">Último intento {fx.ultimo_intento ? fechaLima(fx.ultimo_intento) : ''} falló: {fx.ultimo_error}</div> : null}
          </div>
        ) : <p className="small muted">Cargando tipo de cambio…</p>}
        <form onSubmit={guardar} className="stack" style={{ maxWidth: 560 }}>
          <div className="form-grid">
            <div className="field"><label>Piso carta normal (S/)</label><input className="input" inputMode="decimal" value={form.normal} onChange={e => setForm(f => ({ ...f, normal: e.target.value }))} /></div>
            <div className="field"><label>Piso holo / reverse / ex / especiales (S/)</label><input className="input" inputMode="decimal" value={form.especial} onChange={e => setForm(f => ({ ...f, especial: e.target.value }))} /></div>
            <div className="field"><label>Comisión del mercado (%)</label><input className="input" inputMode="decimal" value={form.comision} onChange={e => setForm(f => ({ ...f, comision: e.target.value }))} /></div>
            <div className="field"><label>Respaldo US$ → S/</label><input className="input" inputMode="decimal" value={form.usd_pen} onChange={e => setForm(f => ({ ...f, usd_pen: e.target.value }))} /></div>
            <div className="field"><label>Respaldo € → S/</label><input className="input" inputMode="decimal" value={form.eur_pen} onChange={e => setForm(f => ({ ...f, eur_pen: e.target.value }))} /></div>
          </div>
          <div className="row"><button className="btn primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button></div>
        </form>
        <p className="small muted">Precio por defecto de una carta = máximo entre su piso y su valor de mercado en soles. Ej.: normal con mercado S/ 0.40 → {fmtPen(Math.max(Number(form.normal) || 0, 0.4))}; holo con mercado S/ 1.50 → {fmtPen(Math.max(Number(form.especial) || 0, 1.5))}; S/ 12 → {fmtPen(12)}.</p>
      </div>

      <MazosMeta />

      <div className="panel">
        <h3>Tarea diaria (00:00 de Lima)</h3>
        {cronOk === false ? <Aviso tipo="warn">Falta la variable <span className="mono">CRON_SECRET</span> en Vercel: sin ella Vercel Cron y pg_cron no pueden disparar la tarea (el botón de abajo sí funciona).</Aviso> : null}
        <p className="small muted">Renueva el tipo de cambio y los precios de todas las cartas que están en colecciones o publicaciones, recalcula los precios por defecto de las publicaciones y actualiza los mazos del meta. Trabaja por tandas de hasta 45 s (límite de Vercel) y <b>se vuelve a llamar sola</b> hasta terminar, así que la carga completa acaba la misma noche; pg_cron (cada 10 min) y Vercel Cron la despiertan si algo la interrumpe.</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary sm" onClick={() => ejecutar(false)} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar ahora (continuar la de hoy)'}</button>
          <button className="btn sm" onClick={() => ejecutar(true)} disabled={ejecutando}>Forzar una ejecución nueva</button>
        </div>
        {salida.length ? <pre className="mono small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{salida.join('\n')}</pre> : null}
        <table className="tabla" style={{ marginTop: 10 }}>
          <thead><tr><th>Fecha (Lima)</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>
            {tareas.map(t => {
              const d = t.detalle as { fecha?: string; fase?: string; renovadas?: number; errores?: number; fx?: { usd_pen?: number; renovado?: boolean; error?: string }; ultimoError?: string; publicaciones?: { recalculadas?: number }; mazos?: { error?: string; procesados?: number; arquetipos?: number; listas?: number; errores?: string[] } };
              return (
                <tr key={t.id}>
                  <td>{d.fecha || '—'}</td>
                  <td>{new Date(t.inicio).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false })}</td>
                  <td>{t.fin ? new Date(t.fin).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false }) : '…'}</td>
                  <td className={`estado-${t.estado}`}>{t.estado === 'ok' ? 'OK' : t.estado === 'error' ? 'Error' : `En curso (${d.fase || '…'})`}</td>
                  <td className="small">{d.renovadas ?? 0} precios renovados · {d.errores ?? 0} errores{d.fx ? ` · cambio ${d.fx.renovado ? 'renovado' : 'no renovado'}${d.fx.usd_pen ? ` (US$1 = S/ ${d.fx.usd_pen})` : ''}` : ''}{d.publicaciones ? ` · ${d.publicaciones.recalculadas ?? 0} publicaciones recalculadas` : ''}{d.mazos ? ` · mazos: ${d.mazos.error ? 'error (' + String(d.mazos.error).slice(0, 80) + ')' : `${d.mazos.procesados ?? d.mazos.arquetipos ?? 0}/${d.mazos.arquetipos ?? 0} arquetipos, ${d.mazos.listas ?? 0} listas${d.mazos.errores && d.mazos.errores.length ? `, ${d.mazos.errores.length} con error` : ''}`}` : ''}{d.ultimoError ? <div className="estado-error">{String(d.ultimoError).slice(0, 160)}</div> : null}</td>
                </tr>
              );
            })}
            {!tareas.length ? <tr><td colSpan={5} className="muted">Todavía no hay ejecuciones registradas.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

type EstadoMazos = { arquetipos: number; variantes: number; listas: number; ultima: { actualizado?: string; arquetipos?: number; listas?: number; nuevas?: number; errores?: string[] } | null };

/** Mazos del meta: estado y botón "Actualizar mazos ahora" con progreso (arquetipo X de N). */
function MazosMeta() {
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoMazos | null>(null);
  const [progreso, setProgreso] = useState<{ procesados: number; arquetipos: number; listas: number } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const cargar = useCallback(async () => { const r = await fetch('/api/admin/mazos').then(x => x.json()).catch(() => null); if (r?.ok) setEstado(r); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  async function actualizar() {
    setCorriendo(true); setErrores([]); setProgreso({ procesados: 0, arquetipos: 0, listas: 0 });
    let cursor: unknown = null;
    try {
      for (let vuelta = 0; vuelta < 30; vuelta++) {
        const r = await fetch('/api/admin/mazos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor }) });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) { toast('No se pudieron actualizar los mazos: ' + (j.error || r.status), 'danger', 6000); setErrores([String(j.error || r.status)]); break; }
        setProgreso({ procesados: j.detalle.procesados, arquetipos: j.detalle.arquetipos, listas: j.detalle.listas });
        setErrores(j.detalle.errores || []);
        if (j.hecho) { toast(`Mazos actualizados: ${j.detalle.arquetipos} arquetipos, ${j.detalle.listas} listas`, 'ok', 5000); break; }
        cursor = j.cursor;
      }
    } finally { setCorriendo(false); cargar(); }
  }
  const u = estado?.ultima;
  return (
    <div className="panel" data-testid="admin-mazos">
      <h3>Mazos del meta (Limitless)</h3>
      {estado ? <p className="small" style={{ marginBottom: 6 }} data-testid="mazos-estado"><b>{estado.arquetipos}</b> arquetipos · <b>{estado.variantes}</b> variantes · <b>{estado.listas}</b> listas de 60 en la base{u?.actualizado ? <span className="muted"> · última carga completa: {new Date(u.actualizado).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false })} ({haceCuanto(u.actualizado)})</span> : <span className="muted"> · nunca se completó una carga</span>}</p> : <p className="small muted">Cargando…</p>}
      {estado && estado.arquetipos < 15 && !corriendo ? <Aviso tipo="warn">Hay menos de 15 arquetipos: pulsa «Actualizar mazos ahora». Si la carga se corta, mira los errores que aparecen debajo.</Aviso> : null}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn primary sm" onClick={actualizar} disabled={corriendo} data-testid="btn-actualizar-mazos">{corriendo ? 'Actualizando…' : '🃏 Actualizar mazos ahora'}</button>
        {progreso ? <span className="small" data-testid="mazos-progreso">{progreso.arquetipos ? `Arquetipo ${Math.min(progreso.procesados, progreso.arquetipos)} de ${progreso.arquetipos} · ${progreso.listas} listas` : 'Descargando la lista de arquetipos…'}{corriendo ? ' …' : ' ✔'}</span> : null}
      </div>
      {progreso && progreso.arquetipos ? <div className="progress" style={{ marginTop: 8, maxWidth: 420 }}><div style={{ width: `${Math.round((Math.min(progreso.procesados, progreso.arquetipos) / progreso.arquetipos) * 100)}%` }} /></div> : null}
      {(errores.length ? errores : u?.errores || []).length ? <div className="small estado-error" style={{ marginTop: 6 }}>Arquetipos con error (se conservó su versión anterior): {(errores.length ? errores : u?.errores || []).join(' · ')}</div> : null}
      <p className="small muted" style={{ margin: '8px 0 0' }}>Se descargan hasta 20 arquetipos con sus últimas 8 listas cada uno y se agrupan en variantes. La tarea diaria lo hace sola cada noche; este botón sirve para no esperar.</p>
    </div>
  );
}
