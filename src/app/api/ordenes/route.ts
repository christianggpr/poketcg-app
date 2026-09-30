import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { mantenimientoRapido } from '@/lib/notificar';
import { borrarFotosVendidas } from '@/lib/ordenes-servidor';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/**
 * Acciones sobre una orden con la sesión del usuario (la base decide quién puede):
 * { accion: 'fecha', id, fecha } · { accion: 'en_tienda', id, foto? } · { accion: 'entregada', id, codigo? }
 * Después envía los correos generados y borra las fotos de las publicaciones que se agotaron.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const b = await leerJson(req);
  const id = String(b.id || '');
  let r: { data: unknown; error: { message: string } | null };
  if (b.accion === 'fecha') r = await supabase.rpc('elegir_fecha_entrega', { p_orden: id, p_fecha: String(b.fecha || '') });
  else if (b.accion === 'en_tienda') r = await supabase.rpc('marcar_en_tienda', { p_orden: id, p_foto: b.foto ? String(b.foto) : null });
  else if (b.accion === 'entregada') r = await supabase.rpc('marcar_entregada', { p_orden: id, p_codigo: b.codigo ? String(b.codigo) : null, p_modo: null });
  else return json({ ok: false, error: 'Acción desconocida.' }, 400);
  if (r.error) return json({ ok: false, error: r.error.message }, 400);
  const res = r.data as { ok: boolean; error?: string; publicaciones_vendidas?: string[] };
  if (!res.ok) return json({ ok: false, error: res.error }, 400);
  const admin = supabaseAdmin();
  if (res.publicaciones_vendidas?.length) await borrarFotosVendidas(admin, res.publicaciones_vendidas);
  if (b.accion === 'entregada') await admin.rpc('liberar_saldos');   // con liberacion_dias = 0 la ganancia queda lista al instante
  await mantenimientoRapido(admin, true).catch(() => null);
  return json({ ...res, ok: true });
}

