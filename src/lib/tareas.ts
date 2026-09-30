// Tarea diaria (00:00 de Lima = 05:00 UTC): tipo de cambio, renovación de precios de las cartas que
// están en colecciones o publicaciones, recálculo de precios por defecto. Trabaja por lotes con un
// presupuesto de tiempo: cada "tick" (Vercel Cron, pg_cron o una visita) avanza lo que puede.
import type { SupabaseClient } from '@supabase/supabase-js';
import { renovarTipoCambio } from './ajustes';
import { preciosDe } from './tcgdex';
import { actualizarMazos, type CursorMazos } from './mazos';
import { procesarDiaDePago } from './retiros';

export type Tarea = {
  id: number;
  nombre: string;
  inicio: string;
  fin: string | null;
  estado: 'en_curso' | 'ok' | 'error';
  detalle: Record<string, unknown>;
  cursor: Record<string, unknown>;
  bloqueo_hasta: string | null;
};

/** Fecha de hoy en Lima (UTC−5), formato AAAA-MM-DD. */
export function fechaLima(ahora = Date.now()): string {
  return new Date(ahora - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Resultado = { pendiente: boolean; tarea: Tarea | null; hecho: string[]; ocupado?: boolean };

/**
 * Avanza la tarea diaria durante como máximo `presupuestoMs`. Devuelve si queda trabajo pendiente.
 * Idempotente: se puede llamar cuantas veces se quiera; si otro tick está en marcha, no hace nada.
 */
export async function tick(admin: SupabaseClient, presupuestoMs = 50000, opts: { forzar?: boolean } = {}): Promise<Resultado> {
  const t0 = Date.now();
  const hecho: string[] = [];
  const fecha = fechaLima();
  const nombre = 'renovacion_diaria';

  // 1) tarea de hoy (se crea si no existe, o si se fuerza una nueva ejecución)
  let { data: tarea } = await admin.from('tareas_programadas').select('*').eq('nombre', nombre).eq('detalle->>fecha', fecha).order('inicio', { ascending: false }).limit(1).maybeSingle<Tarea>();
  if (tarea && tarea.estado !== 'en_curso' && !opts.forzar) return { pendiente: false, tarea, hecho };
  if (!tarea || (tarea.estado !== 'en_curso' && opts.forzar)) {
    const { data, error } = await admin.from('tareas_programadas').insert({ nombre, estado: 'en_curso', detalle: { fecha, renovadas: 0, errores: 0, fase: 'fx' }, cursor: {} }).select('*').single<Tarea>();
    if (error || !data) throw new Error('No se pudo crear la tarea: ' + (error?.message || ''));
    tarea = data;
    hecho.push('tarea creada');
  }

  // 2) bloqueo: solo un tick a la vez (el bloqueo caduca solo por si un tick muere)
  const hasta = new Date(t0 + presupuestoMs + 15000).toISOString();
  const { data: bloqueada } = await admin.from('tareas_programadas').update({ bloqueo_hasta: hasta }).eq('id', tarea.id).or(`bloqueo_hasta.is.null,bloqueo_hasta.lt.${new Date(t0).toISOString()}`).select('id').maybeSingle();
  if (!bloqueada) return { pendiente: true, tarea, hecho, ocupado: true };

  const detalle = { ...tarea.detalle } as { fecha: string; renovadas: number; errores: number; fase: string; fx?: unknown; ultimoError?: string; sinPrecio?: number };
  const quedaTiempo = () => Date.now() - t0 < presupuestoMs;
  const guardar = async (extra: Partial<Tarea> = {}) => { await admin.from('tareas_programadas').update({ detalle, ...extra }).eq('id', tarea!.id); };

  try {
    // 3) tipo de cambio
    if (detalle.fase === 'fx') {
      const r = await renovarTipoCambio(admin, true);
      detalle.fx = { usd_pen: r.fx.usd_pen, eur_pen: r.fx.eur_pen, fuente: r.fx.fuente, renovado: r.renovado, error: r.error };
      detalle.fase = 'precios';
      hecho.push('tipo de cambio ' + (r.renovado ? 'renovado' : 'sin cambios'));
      await guardar();
    }
    // 4) precios de las cartas en colecciones y publicaciones (por lotes de 200 hasta agotar el presupuesto)
    if (detalle.fase === 'precios') {
      const inicioDia = new Date(tarea.inicio).toISOString();
      let agotado = false;
      while (quedaTiempo()) {
        const { data: ids, error } = await admin.rpc('cartas_por_renovar', { desde: inicioDia, limite: 200 });
        if (error) throw new Error('cartas_por_renovar: ' + error.message);
        const lista = (ids || []).map((r: { carta_id: string }) => r.carta_id);
        if (!lista.length) { agotado = true; break; }
        const { registros } = await preciosDe(admin, lista, true);
        const conError = registros.filter(r => r.error).length;
        detalle.renovadas += registros.length - conError;
        detalle.errores += conError;
        if (conError === registros.length) { detalle.ultimoError = registros.find(r => r.error)?.error; break; } // sin red: no insistir
        await guardar();
      }
      if (agotado) { detalle.fase = 'publicaciones'; hecho.push(`precios renovados (${detalle.renovadas})`); await guardar(); }
      else hecho.push(`precios: ${detalle.renovadas} renovadas, continúa`);
    }
    // 5) publicaciones con precio por defecto (Fase 2 · B) — se recalculan en la base
    if (detalle.fase === 'publicaciones' && quedaTiempo()) {
      const { data, error } = await admin.rpc('recalcular_publicaciones');
      if (error && !/function .* does not exist/i.test(error.message)) throw new Error('recalcular_publicaciones: ' + error.message);
      if (!error) (detalle as Record<string, unknown>).publicaciones = data;
      detalle.fase = 'mercado';
      hecho.push('publicaciones recalculadas');
      await guardar();
    }
    // 6) mercado (Fase 2 · C): reservas vencidas liberadas y avisos viejos borrados
    if (detalle.fase === 'mercado' && quedaTiempo()) {
      const { data, error } = await admin.rpc('mantenimiento_mercado');
      if (error && !/function .* does not exist/i.test(error.message)) throw new Error('mantenimiento_mercado: ' + error.message);
      if (!error) (detalle as Record<string, unknown>).mercado = data;
      detalle.fase = 'mazos';
      hecho.push('mercado: reservas vencidas liberadas');
      await guardar();
    }
    // 6b) órdenes (Fase 3 · B): recordatorios, confirmación automática y vencidas
    if (detalle.fase === 'mazos' && !(detalle as Record<string, unknown>).ordenes && quedaTiempo()) {
      const { data, error } = await admin.rpc('mantenimiento_ordenes');
      if (error && !/function .* does not exist/i.test(error.message)) throw new Error('mantenimiento_ordenes: ' + error.message);
      (detalle as Record<string, unknown>).ordenes = error ? { omitido: true } : data;
      hecho.push('órdenes: recordatorios, confirmaciones automáticas y vencidas');
      await guardar();
    }
    // 6c) saldos y día de pago (Fase 3 · C): libera ganancias y, si hoy es día de pago, genera el Excel
    if (detalle.fase === 'mazos' && !(detalle as Record<string, unknown>).pagos && quedaTiempo()) {
      const { data, error } = await admin.rpc('liberar_saldos');
      if (error && !/function .* does not exist/i.test(error.message)) throw new Error('liberar_saldos: ' + error.message);
      const info: Record<string, unknown> = { liberadas: (data as { liberadas?: number } | null)?.liberadas ?? 0 };
      if (!error) {
        const { data: aj } = await admin.from('ajustes_globales').select('valor').eq('clave', 'pagos').maybeSingle();
        const dias = ((aj?.valor as { dias_pago?: number[] } | null)?.dias_pago) || [0, 1, 2, 3, 4, 5, 6];
        const hoyLima = new Date(Date.now() - 5 * 3600 * 1000);
        if (dias.includes(hoyLima.getUTCDay())) {
          try { Object.assign(info, await procesarDiaDePago(admin, new Date())); } catch (e) { info.excel_error = e instanceof Error ? e.message : String(e); }
        } else info.dia_de_pago = false;
      }
      (detalle as Record<string, unknown>).pagos = info;
      hecho.push(`saldos liberados (${info.liberadas})${info.generado ? `, Excel de pagos enviado (S/ ${info.total})` : ''}`);
      await guardar();
    }
    // 7) mazos meta (Fase 2 · D): Limitless por lotes; si falla se conserva la última versión
    if (detalle.fase === 'mazos' && quedaTiempo()) {
      const cursor = (tarea.cursor?.mazos as CursorMazos | undefined) || null;
      try {
        const r = await actualizarMazos(admin, Math.max(5000, presupuestoMs - (Date.now() - t0) - 3000), cursor);
        (detalle as Record<string, unknown>).mazos = r.detalle;
        if (r.hecho) { detalle.fase = 'fin'; hecho.push(`mazos actualizados (${r.detalle.arquetipos} arquetipos, ${r.detalle.listas} listas)`); }
        else hecho.push(`mazos: ${r.detalle.procesados}/${r.detalle.arquetipos} arquetipos, continúa`);
        tarea.cursor = { ...(tarea.cursor || {}), mazos: r.hecho ? null : r.cursor };
        await guardar({ cursor: tarea.cursor });
      } catch (e) {
        (detalle as Record<string, unknown>).mazos = { error: e instanceof Error ? e.message : String(e), conservada: true };
        detalle.fase = 'fin';
        hecho.push('mazos: Limitless no respondió, se conserva la versión anterior');
        await guardar({ cursor: { ...(tarea.cursor || {}), mazos: null } });
      }
    }
    if (detalle.fase === 'fin') {
      await guardar({ estado: 'ok', fin: new Date().toISOString(), bloqueo_hasta: null });
      hecho.push('terminada');
      const { data: final } = await admin.from('tareas_programadas').select('*').eq('id', tarea.id).single<Tarea>();
      return { pendiente: false, tarea: final, hecho };
    }
    await guardar({ bloqueo_hasta: null });
    const { data: parcial } = await admin.from('tareas_programadas').select('*').eq('id', tarea.id).single<Tarea>();
    return { pendiente: true, tarea: parcial, hecho };
  } catch (e) {
    detalle.ultimoError = e instanceof Error ? e.message : String(e);
    detalle.errores++;
    await guardar({ estado: 'error', fin: new Date().toISOString(), bloqueo_hasta: null });
    throw e;
  }
}

/** Avanza la tarea diaria si está pendiente (para llamadas oportunistas desde las visitas). */
export async function tickSiPendiente(admin: SupabaseClient, presupuestoMs = 4000): Promise<void> {
  try {
    const fecha = fechaLima();
    const { data } = await admin.from('tareas_programadas').select('id, estado').eq('nombre', 'renovacion_diaria').eq('detalle->>fecha', fecha).limit(1).maybeSingle();
    if (data && data.estado !== 'en_curso') return;
    await tick(admin, presupuestoMs);
  } catch { /* la visita no debe fallar por la tarea */ }
}
