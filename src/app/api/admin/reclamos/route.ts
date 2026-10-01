import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { mantenimientoRapido } from '@/lib/notificar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Reclamos (Fase 4 · B): ?estado=abierto|resuelto|todos, con la orden, nombres de usuario y fotos firmadas. */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const estado = new URL(req.url).searchParams.get('estado') || 'abierto';
  let q = admin.from('reclamos').select('*').order('creado', { ascending: false }).limit(100);
  if (estado !== 'todos') q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  const reclamos = (data || []) as Record<string, unknown>[];
  const ordenIds = [...new Set(reclamos.map(r => r.orden_id as string))];
  const usuarioIds = [...new Set(reclamos.flatMap(r => [r.comprador_id as string, r.vendedor_id as string]))];
  const [{ data: ordenes }, { data: perfiles }, { data: items }] = await Promise.all([
    ordenIds.length ? admin.from('ordenes').select('id, numero, estado, subtotal, neto_vendedor, tienda_id, en_tienda_en, codigo_retiro').in('id', ordenIds) : Promise.resolve({ data: [] }),
    usuarioIds.length ? admin.from('perfiles').select('id, username').in('id', usuarioIds) : Promise.resolve({ data: [] }),
    ordenIds.length ? admin.from('orden_items').select('orden_id, carta_id, cantidad, precio_pen, idioma, acabado, condicion').in('orden_id', ordenIds) : Promise.resolve({ data: [] })
  ]);
  const porOrden = new Map((ordenes || []).map(o => [o.id as string, o]));
  const nombre = new Map((perfiles || []).map(p => [p.id as string, p.username as string]));
  const salida = [];
  for (const r of reclamos) {
    const fotos: string[] = [];
    for (const f of (r.fotos as string[]) || []) {
      const ruta = f.replace(/^comprobantes\//, '');
      const { data: s } = await admin.storage.from('comprobantes').createSignedUrl(ruta, 3600);
      if (s?.signedUrl) fotos.push(s.signedUrl);
    }
    salida.push({ ...r, fotos_url: fotos, orden: porOrden.get(r.orden_id as string) || null, comprador: nombre.get(r.comprador_id as string) || '?', vendedor: nombre.get(r.vendedor_id as string) || '?', items: (items || []).filter(i => i.orden_id === r.orden_id) });
  }
  return json({ ok: true, reclamos: salida });
}

/** { id, resolucion: 'devolver'|'entregar'|'parcial', monto?, nota? } → resolver_reclamo con la sesión del administrador. */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('resolver_reclamo', { p_reclamo: String(b.id || ''), p_resolucion: String(b.resolucion || ''), p_monto: b.monto != null && b.monto !== '' ? Number(b.monto) : null, p_nota: String(b.nota || '').slice(0, 500) });
  if (error) return json({ ok: false, error: error.message }, 400);
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) return json({ ok: false, error: r.error }, 400);
  await mantenimientoRapido(supabaseAdmin(), true).catch(() => null);
  return json({ ...r, ok: true });
}
