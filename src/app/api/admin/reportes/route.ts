import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { fechaValida, rangoPorDefecto, reporteVentas, type Grupo } from '@/lib/reportes';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Reporte de ventas y comisiones: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&grupo=dia|semana|mes */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const u = new URL(req.url);
  const def = rangoPorDefecto();
  const desde = fechaValida(u.searchParams.get('desde')) ? u.searchParams.get('desde')! : def.desde;
  const hasta = fechaValida(u.searchParams.get('hasta')) ? u.searchParams.get('hasta')! : def.hasta;
  const grupo = (['dia', 'semana', 'mes'].includes(u.searchParams.get('grupo') || '') ? u.searchParams.get('grupo') : 'dia') as Grupo;
  if (desde > hasta) return json({ ok: false, error: 'La fecha inicial debe ser anterior a la final.' }, 400);
  try {
    const reporte = await reporteVentas(await supabaseServer(), desde, hasta, grupo);
    return json({ ok: true, reporte });
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
}
