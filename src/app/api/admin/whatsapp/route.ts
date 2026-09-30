import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { enlaceWhatsApp } from '@/lib/notificar';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Avisos con canal WhatsApp que el administrador aún no envió (etapa 1: enlace wa.me con el texto). */
export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('notificaciones').select('id, usuario_id, titulo, cuerpo, creada, datos').contains('canales', ['whatsapp']).order('creada', { ascending: false }).limit(200);
  if (error) return json({ ok: false, error: error.message }, 500);
  const pendientes = (data || []).filter(n => !(n.datos as { wa_enviado?: boolean })?.wa_enviado);
  const ids = [...new Set(pendientes.map(n => n.usuario_id as string))];
  const { data: perfiles } = ids.length ? await admin.from('perfiles').select('id, username, telefono').in('id', ids) : { data: [] as { id: string; username: string; telefono: string | null }[] };
  const porId = new Map((perfiles || []).map(p => [p.id as string, p]));
  return json({ ok: true, pendientes: pendientes.map(n => { const p = porId.get(n.usuario_id as string); const texto = `${n.titulo}\n${n.cuerpo}`; return { id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, creada: n.creada, username: p?.username || '?', telefono: p?.telefono || null, url: enlaceWhatsApp(p?.telefono, texto) }; }) });
}

/** Marca un aviso como enviado por WhatsApp. */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const b = await leerJson(req);
  const admin = supabaseAdmin();
  const { data: n } = await admin.from('notificaciones').select('id, datos').eq('id', Number(b.id)).maybeSingle();
  if (!n) return json({ ok: false, error: 'No existe.' }, 404);
  const { error } = await admin.from('notificaciones').update({ datos: { ...(n.datos as Record<string, unknown>), wa_enviado: true, wa_enviado_en: new Date().toISOString() } }).eq('id', n.id);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}
