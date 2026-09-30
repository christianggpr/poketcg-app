import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual, traeSecretoCron } from '@/lib/admin-servidor';
import { tick } from '@/lib/tareas';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Avanza la tarea diaria (precios, tipo de cambio, publicaciones). La llaman Vercel Cron (05:00 UTC),
 * pg_cron cada 10 minutos y el botón "Ejecutar ahora" de /admin. Cada llamada trabaja ≤ 50 s.
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
  try {
    const r = await tick(admin, 50000, { forzar: url.searchParams.get('forzar') === '1' });
    return json({ ok: true, pendiente: r.pendiente, ocupado: !!r.ocupado, hecho: r.hecho, tarea: r.tarea && { id: r.tarea.id, estado: r.tarea.estado, detalle: r.tarea.detalle } });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
export const GET = manejar;
export const POST = manejar;
