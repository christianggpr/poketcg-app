import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual, traeSecretoCron } from '@/lib/admin-servidor';
import { tick } from '@/lib/tareas';
import { mantenimientoRapido } from '@/lib/notificar';
import { json } from '@/lib/auth-servidor';
import { appUrl } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Máximo de llamadas encadenadas por noche (40 × 45 s ≈ 30 min): la tarea nunca queda en un bucle. */
const MAX_CADENA = 40;

/**
 * Avanza la tarea diaria (precios, tipo de cambio, publicaciones, mazos). La llaman Vercel Cron (05:00 UTC),
 * pg_cron cada 10 minutos y el botón "Ejecutar ahora" de /admin. Cada llamada trabaja ≤ 45 s y, si queda
 * trabajo, se vuelve a llamar a sí misma (en cadena) hasta terminar: así la carga completa acaba la misma noche
 * aunque el cron de Vercel solo corra una vez al día.
 */
async function manejar(req: Request) {
  const url = new URL(req.url);
  const porSecreto = traeSecretoCron(req);
  if (!porSecreto && !(await esAdminActual())) return json({ ok: false, error: 'No autorizado.' }, 401);
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const cadena = Math.max(0, parseInt(url.searchParams.get('cadena') || '0', 10) || 0);
  const sinCadena = url.searchParams.get('cadena') === 'no';
  try {
    // Fase 3: cada llamada (pg_cron cada 10 min) vence compras sin comprobante y envía correos pendientes
    const rapido = await mantenimientoRapido(admin, true);
    // presupuesto por llamada (solo con el secreto del cron, para pruebas): de 0 a 45 s
    const presupuesto = porSecreto && url.searchParams.get('presupuesto') != null ? Math.min(45000, Math.max(0, parseInt(url.searchParams.get('presupuesto')!, 10) || 0)) : 45000;
    const r = await tick(admin, presupuesto, { forzar: url.searchParams.get('forzar') === '1' });
    let continuara = false;
    if (r.pendiente && !r.ocupado && !sinCadena && cadena < MAX_CADENA && process.env.CRON_SECRET) {
      continuara = true;
      const siguiente = `${appUrl()}/api/tareas/tick?cadena=${cadena + 1}`;
      // después de responder, dispara la siguiente llamada (no espera su resultado)
      after(async () => {
        try { await fetch(siguiente, { method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(5000) }); } catch { /* el cron la retomará */ }
      });
    }
    return json({ ok: true, pendiente: r.pendiente, ocupado: !!r.ocupado, continuara, cadena, hecho: r.hecho, rapido, tarea: r.tarea && { id: r.tarea.id, estado: r.tarea.estado, detalle: r.tarea.detalle } });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
export const GET = manejar;
export const POST = manejar;
