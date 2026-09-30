import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Órdenes por estado con comprador, vendedor, tienda e ítems (para /admin → Órdenes). */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const estado = new URL(req.url).searchParams.get('estado') || 'activas';
  let q = admin.from('ordenes').select('*').order('creada', { ascending: false }).limit(200);
  if (estado === 'activas') q = q.in('estado', ['pago_confirmado', 'en_tienda']);
  else if (estado !== 'todas') q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  const filas = data || [];
  const ids = filas.map(o => o.id as string);
  const idsU = [...new Set(filas.flatMap(o => [o.comprador_id as string, o.vendedor_id as string]))];
  const [{ data: items }, { data: perfiles }, { data: tiendas }] = await Promise.all([
    ids.length ? admin.from('orden_items').select('*').in('orden_id', ids) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    idsU.length ? admin.from('perfiles').select('id, username, telefono').in('id', idsU) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from('tiendas').select('id, nombre, distrito')
  ]);
  const perfil = new Map((perfiles || []).map(p => [p.id as string, p]));
  const tienda = new Map((tiendas || []).map(t => [t.id as string, t]));
  return json({ ok: true, ordenes: filas.map(o => ({ ...o, comprador: perfil.get(o.comprador_id as string) || null, vendedor: perfil.get(o.vendedor_id as string) || null, tienda: tienda.get(o.tienda_id as string) || null, orden_items: (items || []).filter(i => i.orden_id === o.id) })) });
}
