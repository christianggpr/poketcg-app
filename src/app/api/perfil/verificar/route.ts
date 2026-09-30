import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { enlaceWhatsApp } from '@/lib/notificar';
import { APP_NAME } from '@/lib/config';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/**
 * Verificación del celular por WhatsApp (gratis): la app genera un código de 6 dígitos y el usuario
 * lo envía por WhatsApp al número de la app; el administrador comprueba que el remitente es el
 * celular registrado y lo marca verificado en /admin.
 */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const admin = supabaseAdmin();
  const [{ data: p }, { data: aj }] = await Promise.all([
    admin.from('perfiles').select('id, username, telefono, celular_verificado_en, codigo_verificacion, codigo_verificacion_expira').eq('id', user.id).maybeSingle(),
    admin.from('ajustes_globales').select('valor').eq('clave', 'pagos').maybeSingle()
  ]);
  if (!p) return json({ ok: false, error: 'Sin perfil.' }, 404);
  if (!p.telefono) return json({ ok: false, error: 'Primero registra tu celular en Ajustes.' }, 400);
  if (p.celular_verificado_en) return json({ ok: true, verificado: true });
  const whatsapp = String((aj?.valor as { whatsapp?: string } | null)?.whatsapp || '');
  if (!/^9\d{8}$/.test(whatsapp)) return json({ ok: false, error: 'La app aún no tiene un número de WhatsApp configurado. Intenta más tarde.' }, 503);
  let codigo = p.codigo_verificacion as string | null;
  const vigente = codigo && p.codigo_verificacion_expira && Date.parse(p.codigo_verificacion_expira as string) > Date.now();
  if (!vigente) {
    codigo = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await admin.from('perfiles').update({ codigo_verificacion: codigo, codigo_verificacion_expira: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }).eq('id', p.id);
    if (error) return json({ ok: false, error: error.message }, 500);
  }
  const texto = `Hola ${APP_NAME}, soy @${p.username} y mi código de verificación es ${codigo}`;
  return json({ ok: true, verificado: false, codigo, whatsapp, url: enlaceWhatsApp(whatsapp, texto), texto });
}
