import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Últimas ejecuciones de las tareas programadas. */
export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('tareas_programadas').select('id, nombre, inicio, fin, estado, detalle, bloqueo_hasta').order('inicio', { ascending: false }).limit(15);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, tareas: data, cronConfigurado: !!process.env.CRON_SECRET });
}
