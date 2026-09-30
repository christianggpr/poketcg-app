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

  const fxTxt = ajustes ? `US$1 = S/ ${ajustes.fx.usd_pen.toFixed(3)} · €1 = S/ ${ajustes.fx.eur_pen.toFixed(3)} (${ajustes.fx.fuente || '—'}${ajustes.fx.t ? ', ' + haceCuanto(new Date(ajustes.fx.t).toISOString()) : ''})` : '…';

  return (
    <>
      <div className="panel">
        <h3>Mercado: tipo de cambio, pisos y comisión</h3>
        <p className="small muted">Tipo de cambio vigente: <b>{fxTxt}</b>. Se descarga de open.er-api.com en la tarea diaria; si falla, se usa el respaldo de abajo. <button className="link" onClick={renovarFx}>Descargar ahora</button></p>
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

      <div className="panel">
        <h3>Tarea diaria (00:00 de Lima)</h3>
        {cronOk === false ? <Aviso tipo="warn">Falta la variable <span className="mono">CRON_SECRET</span> en Vercel: sin ella Vercel Cron y pg_cron no pueden disparar la tarea (el botón de abajo sí funciona).</Aviso> : null}
        <p className="small muted">Renueva el tipo de cambio y los precios de todas las cartas que están en colecciones o publicaciones, y recalcula los precios por defecto de las publicaciones. Trabaja por tandas de hasta 50 s (límite de Vercel); pg_cron la sigue despertando cada 10 minutos hasta que termina.</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary sm" onClick={() => ejecutar(false)} disabled={ejecutando}>{ejecutando ? 'Ejecutando…' : 'Ejecutar ahora (continuar la de hoy)'}</button>
          <button className="btn sm" onClick={() => ejecutar(true)} disabled={ejecutando}>Forzar una ejecución nueva</button>
        </div>
        {salida.length ? <pre className="mono small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{salida.join('\n')}</pre> : null}
        <table className="tabla" style={{ marginTop: 10 }}>
          <thead><tr><th>Fecha (Lima)</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>
            {tareas.map(t => {
              const d = t.detalle as { fecha?: string; fase?: string; renovadas?: number; errores?: number; fx?: { usd_pen?: number; renovado?: boolean; error?: string }; ultimoError?: string; publicaciones?: { recalculadas?: number } };
              return (
                <tr key={t.id}>
                  <td>{d.fecha || '—'}</td>
                  <td>{new Date(t.inicio).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false })}</td>
                  <td>{t.fin ? new Date(t.fin).toLocaleString('es-PE', { timeZone: 'America/Lima', hour12: false }) : '…'}</td>
                  <td className={`estado-${t.estado}`}>{t.estado === 'ok' ? 'OK' : t.estado === 'error' ? 'Error' : `En curso (${d.fase || '…'})`}</td>
                  <td className="small">{d.renovadas ?? 0} precios renovados · {d.errores ?? 0} errores{d.fx ? ` · cambio ${d.fx.renovado ? 'renovado' : 'no renovado'}${d.fx.usd_pen ? ` (US$1 = S/ ${d.fx.usd_pen})` : ''}` : ''}{d.publicaciones ? ` · ${d.publicaciones.recalculadas ?? 0} publicaciones recalculadas` : ''}{d.ultimoError ? <div className="estado-error">{String(d.ultimoError).slice(0, 160)}</div> : null}</td>
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
