import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { mantenimientoRapido } from '@/lib/notificar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Verificaciones de celular pendientes (el usuario ya pidió su código y debe haberlo enviado por WhatsApp). */
export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('perfiles').select('id, username, nombres, apellidos, telefono, codigo_verificacion, codigo_verificacion_expira, celular_verificado_en').not('codigo_verificacion', 'is', null).is('celular_verificado_en', null).order('codigo_verificacion_expira', { ascending: false }).limit(100);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, pendientes: data || [] });
}

/**
 * Acciones sobre usuarios: { accion: 'verificar_celular' | 'rechazar_celular', id } y
 * { accion: 'rol_tienda', username, tienda_id | null } (asigna o quita la cuenta de sede).
 */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const b = await leerJson(req);
  if (b.accion === 'verificar_celular' || b.accion === 'rechazar_celular') {
    const id = String(b.id || '');
    const { data: p } = await admin.from('perfiles').select('id, telefono, username').eq('id', id).maybeSingle();
    if (!p) return json({ ok: false, error: 'Usuario no encontrado.' }, 404);
    const ok = b.accion === 'verificar_celular';
    const { error } = await admin.from('perfiles').update({ celular_verificado_en: ok ? new Date().toISOString() : null, codigo_verificacion: null, codigo_verificacion_expira: null }).eq('id', id);
    if (error) return json({ ok: false, error: error.message }, 500);
    await admin.rpc('notificar', { p_usuario: id, p_tipo: ok ? 'celular_verificado' : 'celular_rechazado', p_titulo: ok ? 'Celular verificado ✔' : 'No pudimos verificar tu celular', p_cuerpo: ok ? `Tu número ${p.telefono} quedó verificado. Ya puedes retirar dinero de tus ventas.` : 'El mensaje de WhatsApp no llegó desde el número registrado en tu perfil. Revisa tu celular en Ajustes y vuelve a intentarlo.', p_enlace: '/app/ajustes', p_datos: {}, p_canales: ['app', 'correo'] });
    await mantenimientoRapido(admin, true).catch(() => null);
    return json({ ok: true });
  }
  if (b.accion === 'rol_tienda') {
    const username = String(b.username || '').trim().toLowerCase();
    const { data: p } = await admin.from('perfiles').select('id, rol').ilike('username', username).maybeSingle();
    if (!p) return json({ ok: false, error: 'No existe ese usuario.' }, 404);
    if (p.rol === 'admin') return json({ ok: false, error: 'Un administrador no puede ser cuenta de tienda.' }, 400);
    const tienda = b.tienda_id ? String(b.tienda_id) : null;
    const { error } = await admin.from('perfiles').update(tienda ? { rol: 'tienda', tienda_id: tienda } : { rol: 'usuario', tienda_id: null }).eq('id', p.id);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }
  return json({ ok: false, error: 'Acción desconocida.' }, 400);
}
