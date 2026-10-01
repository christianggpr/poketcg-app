import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { esAdminActual } from '@/lib/admin-servidor';
import { mantenimientoRapido } from '@/lib/notificar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/**
 * Sin parámetros: verificaciones de celular pendientes. Con ?q=texto: búsqueda de usuarios (nombre de usuario,
 * correo, nombres o DNI) con su reputación y estado; ?q= vacío lista los últimos registrados.
 */
export async function GET(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const url = new URL(req.url);
  if (url.searchParams.has('q')) {
    const q = url.searchParams.get('q')!.trim().toLowerCase().replace(/[%_,]/g, '');
    let consulta = admin.from('perfiles').select('id, username, email, nombres, apellidos, dni, telefono, rol, estado, suspendido_motivo, suspendido_en, reputacion, celular_verificado_en, creado_en').order('creado_en', { ascending: false }).limit(40);
    if (q) consulta = consulta.or(`username.ilike.%${q}%,email.ilike.%${q}%,nombres.ilike.%${q}%,apellidos.ilike.%${q}%,dni.ilike.%${q}%`);
    const { data, error } = await consulta;
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, usuarios: data || [] });
  }
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
  if (b.accion === 'suspender' || b.accion === 'reactivar') {
    const supabase = await supabaseServer();   // con la sesión del administrador (la función exige es_admin)
    const { data, error } = b.accion === 'suspender'
      ? await supabase.rpc('suspender_usuario', { p_usuario: String(b.id || ''), p_motivo: b.motivo ? String(b.motivo).slice(0, 300) : null })
      : await supabase.rpc('reactivar_usuario', { p_usuario: String(b.id || '') });
    if (error) return json({ ok: false, error: error.message }, 400);
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
    await mantenimientoRapido(admin, true).catch(() => null);
    return json({ ...r, ok: true });
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
