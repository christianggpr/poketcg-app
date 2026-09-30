import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { mantenimientoRapido } from '@/lib/notificar';
import { retirosCompletos } from '@/lib/retiros';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Pagos a vendedores: pendientes (con datos de cobro descifrados) o historial. */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const estado = new URL(req.url).searchParams.get('estado') || 'pendientes';
  try {
    const retiros = await retirosCompletos(supabaseAdmin(), estado === 'pendientes' ? ['pendiente', 'sin_datos'] : estado === 'pagado' ? ['pagado'] : ['pendiente', 'sin_datos', 'pagado', 'anulado']);
    return json({ ok: true, retiros });
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
}

/** { accion: 'pagado', ids: [...], n_operacion?, comprobante_url? } · { accion: 'liberar' } (ejecuta liberar_saldos ahora). */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const admin = supabaseAdmin();
  if (b.accion === 'liberar') {
    const { data, error } = await admin.rpc('liberar_saldos');
    if (error) return json({ ok: false, error: error.message }, 500);
    await mantenimientoRapido(admin, true).catch(() => null);
    return json({ ok: true, ...(data as Record<string, unknown>) });
  }
  if (b.accion === 'pagado') {
    const supabase = await supabaseServer();
    const ids = Array.isArray(b.ids) ? b.ids.map(String) : b.id ? [String(b.id)] : [];
    let n = 0;
    for (const id of ids) {
      const { data, error } = await supabase.rpc('marcar_retiro_pagado', { p_retiro: id, p_operacion: b.n_operacion ? String(b.n_operacion).slice(0, 60) : null, p_comprobante: b.comprobante_url ? String(b.comprobante_url) : null });
      if (!error && (data as { ok: boolean }).ok) n++;
    }
    await mantenimientoRapido(admin, true).catch(() => null);
    return json({ ok: true, pagados: n });
  }
  return json({ ok: false, error: 'Acción desconocida.' }, 400);
}
