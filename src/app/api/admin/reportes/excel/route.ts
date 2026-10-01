import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { fechaValida, generarExcelReporte, rangoPorDefecto, type Grupo } from '@/lib/reportes';

export const runtime = 'nodejs';

/** Descarga el reporte en Excel (mismos parámetros que /api/admin/reportes). */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return new Response('Solo el administrador.', { status: 403 });
  const u = new URL(req.url);
  const def = rangoPorDefecto();
  const desde = fechaValida(u.searchParams.get('desde')) ? u.searchParams.get('desde')! : def.desde;
  const hasta = fechaValida(u.searchParams.get('hasta')) ? u.searchParams.get('hasta')! : def.hasta;
  const grupo = (['dia', 'semana', 'mes'].includes(u.searchParams.get('grupo') || '') ? u.searchParams.get('grupo') : 'dia') as Grupo;
  try {
    const { buffer, nombre } = await generarExcelReporte(await supabaseServer(), desde, hasta, grupo);
    return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
  } catch (e) { return new Response((e as Error).message, { status: 500 }); }
}
