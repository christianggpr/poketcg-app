import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const [{ data: tiendas, error }, { data: cuentas }] = await Promise.all([
    admin.from('tiendas').select('*').order('creada'),
    admin.from('perfiles').select('id, username, tienda_id').eq('rol', 'tienda')
  ]);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, tiendas: tiendas || [], cuentas: cuentas || [] });
}

/** Crea o edita una tienda/sede. */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const nombre = String(b.nombre || '').trim();
  if (!nombre) return json({ ok: false, error: 'Falta el nombre de la tienda.' }, 400);
  const dias = Array.isArray(b.dias_abierto) ? [...new Set(b.dias_abierto.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : [1, 2, 3, 4, 5, 6];
  const fila = { nombre, distrito: String(b.distrito || '').trim(), direccion: String(b.direccion || '').trim(), referencia: String(b.referencia || '').trim(), horario: String(b.horario || '').trim(), telefono: b.telefono ? String(b.telefono).replace(/\D/g, '').slice(0, 15) : null, dias_abierto: dias, activa: b.activa !== false, actualizada: new Date().toISOString() };
  const admin = supabaseAdmin();
  const q = b.id ? admin.from('tiendas').update(fila).eq('id', String(b.id)) : admin.from('tiendas').insert(fila);
  const { data, error } = await q.select('*').single();
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, tienda: data });
}
