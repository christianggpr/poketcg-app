import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { validarPerfil } from '@/lib/validar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Actualiza nombres, apellidos, usuario, celular e idioma de nombres (con comprobación de usuario único). */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const v = validarPerfil(await leerJson(req));
  if (!v.ok) return json({ ok: false, errores: v.errores }, 400);
  try {
    const admin = supabaseAdmin();
    const { data: otro } = await admin.from('perfiles').select('id').ilike('username', v.datos.username).neq('id', user.id).maybeSingle();
    if (otro) return json({ ok: false, errores: { username: 'Ese nombre de usuario ya está en uso.' } }, 409);
  } catch {
    // sin clave de servicio: la restricción única de la base de datos avisará igualmente
  }
  const { error } = await supabase.from('perfiles').update({ ...v.datos, telefono: v.datos.telefono || null }).eq('id', user.id);
  if (error) {
    if (error.code === '23505') return json({ ok: false, errores: { username: 'Ese nombre de usuario ya está en uso.' } }, 409);
    return json({ ok: false, error: 'No se pudo guardar: ' + error.message }, 500);
  }
  return json({ ok: true });
}
