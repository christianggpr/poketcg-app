import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { actualizarMazos, type CursorMazos } from '@/lib/mazos';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Estado de los mazos del meta: cuántos hay en la base y cuándo se actualizaron. */
export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const [{ count: arquetipos }, { count: variantes }, { count: listas }, { data: aj }] = await Promise.all([
    admin.from('mazos_arquetipos').select('id', { count: 'exact', head: true }),
    admin.from('mazos_variantes').select('id', { count: 'exact', head: true }),
    admin.from('mazos_listas').select('id', { count: 'exact', head: true }),
    admin.from('ajustes_globales').select('valor').eq('clave', 'mazos').maybeSingle()
  ]);
  return json({ ok: true, arquetipos: arquetipos || 0, variantes: variantes || 0, listas: listas || 0, ultima: aj?.valor || null });
}

/**
 * "Actualizar mazos ahora": cada llamada avanza hasta 40 s y devuelve el cursor; el panel la repite
 * hasta que `hecho` sea true, mostrando el progreso (arquetipo X de N).
 */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const cursor = b.cursor && typeof b.cursor === 'object' && Array.isArray((b.cursor as CursorMazos).ids) ? (b.cursor as CursorMazos) : null;
  try {
    const r = await actualizarMazos(supabaseAdmin(), 40000, cursor);
    return json({ ok: true, hecho: r.hecho, cursor: r.hecho ? null : r.cursor, detalle: r.detalle });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
