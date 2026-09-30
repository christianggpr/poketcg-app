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

/** { accion: 'pagado', ids: [...], n_operacion?, comprobante? (data URL de imagen, solo con un id) } · { accion: 'liberar' } (ejecuta liberar_saldos ahora). */
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
    // comprobante (captura del Yape/Plin) para un solo pago: va al bucket privado, en la carpeta del vendedor, que solo él y el administrador ven
    let ruta: string | null = null;
    const m = ids.length === 1 && typeof b.comprobante === 'string' ? /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.comprobante) : null;
    if (m) {
      const bytes = Buffer.from(m[3], 'base64');
      if (bytes.length > 5 * 1024 * 1024) return json({ ok: false, error: 'El comprobante pesa más de 5 MB.' }, 400);
      const { data: ret } = await admin.from('retiros').select('usuario_id').eq('id', ids[0]).maybeSingle();
      if (!ret) return json({ ok: false, error: 'El pago no existe.' }, 404);
      ruta = `${ret.usuario_id}/pago-${ids[0]}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
      const { error } = await admin.storage.from('comprobantes').upload(ruta, bytes, { contentType: m[1], upsert: true });
      if (error) return json({ ok: false, error: 'No se pudo guardar el comprobante: ' + error.message }, 500);
    }
    let n = 0;
    for (const id of ids) {
      const { data, error } = await supabase.rpc('marcar_retiro_pagado', { p_retiro: id, p_operacion: b.n_operacion ? String(b.n_operacion).slice(0, 60) : null, p_comprobante: ruta });
      if (!error && (data as { ok: boolean }).ok) n++;
    }
    await mantenimientoRapido(admin, true).catch(() => null);
    return json({ ok: true, pagados: n, comprobante: ruta });
  }
  return json({ ok: false, error: 'Acción desconocida.' }, 400);
}
