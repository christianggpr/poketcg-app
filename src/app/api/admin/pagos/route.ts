import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { mantenimientoRapido } from '@/lib/notificar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Pagos (por defecto los que están en revisión) con comprador, tienda, órdenes e ítems, y enlace firmado al voucher. */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const url = new URL(req.url);
  const estado = url.searchParams.get('estado') || 'revision';
  let q = admin.from('pagos').select('*').order('creado', { ascending: false }).limit(100);
  if (estado !== 'todos') q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  const filas = data || [];
  const idsPagos = filas.map(p => p.id as string);
  const [{ data: ordenes }, { data: tiendas }] = await Promise.all([
    idsPagos.length ? admin.from('ordenes').select('*').in('pago_id', idsPagos) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from('tiendas').select('id, nombre, distrito')
  ]);
  const idsOrdenes = (ordenes || []).map(o => o.id as string);
  const { data: items } = idsOrdenes.length ? await admin.from('orden_items').select('*').in('orden_id', idsOrdenes) : { data: [] as Record<string, unknown>[] };
  const idsUsuarios = [...new Set([...filas.map(p => p.comprador_id as string), ...(ordenes || []).map(o => o.vendedor_id as string)])];
  const { data: perfiles } = idsUsuarios.length ? await admin.from('perfiles').select('id, username, nombres, apellidos, telefono, celular_verificado_en').in('id', idsUsuarios) : { data: [] as Record<string, unknown>[] };
  const perfil = new Map((perfiles || []).map(p => [p.id as string, p]));
  const tienda = new Map((tiendas || []).map(t => [t.id as string, t]));
  const pagos = await Promise.all(filas.map(async p => {
    let voucher: string | null = null;
    if (p.voucher_url) {
      const ruta = String(p.voucher_url).replace(/^comprobantes\//, '');
      const { data: s } = await admin.storage.from('comprobantes').createSignedUrl(ruta, 3600);
      voucher = s?.signedUrl || null;
    }
    const { count } = p.n_operacion ? await admin.from('pagos').select('id', { count: 'exact', head: true }).eq('n_operacion', p.n_operacion).neq('id', p.id).in('estado', ['revision', 'confirmado']) : { count: 0 };
    const c = perfil.get(p.comprador_id as string);
    return {
      ...p, voucher, duplicado: (count || 0) > 0,
      comprador: c ? { username: c.username, nombres: c.nombres, apellidos: c.apellidos, telefono: c.telefono, celular_verificado_en: c.celular_verificado_en } : null,
      tienda: tienda.get(p.tienda_id as string) || null,
      ordenes: (ordenes || []).filter(o => o.pago_id === p.id).map(o => ({ ...o, vendedor: perfil.get(o.vendedor_id as string)?.username || null, orden_items: (items || []).filter(i => i.orden_id === o.id) }))
    };
  }));
  return json({ ok: true, pagos });
}

/** Confirmar o rechazar un pago (queda registrado quién lo revisó) y enviar los correos que genera. */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const accion = b.accion === 'rechazar' ? 'rechazar' : 'confirmar';
  const supabase = await supabaseServer();   // con la sesión del administrador: auth.uid() = admin
  const { data, error } = await supabase.rpc('revisar_pago', { p_pago: String(b.id || ''), p_accion: accion, p_motivo: b.motivo ? String(b.motivo).slice(0, 300) : null });
  if (error) return json({ ok: false, error: error.message }, 400);
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return json({ ok: false, error: r.error }, 400);
  await mantenimientoRapido(supabaseAdmin(), true).catch(() => null);
  return json({ ...r, ok: true });
}
