import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarCorreo, correoRecuperacion } from '@/lib/correo';
import { json, leerJson, emailDeIdentificador, enlaceVerificacion } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Envía el correo para elegir una contraseña nueva. */
export async function POST(req: Request) {
  const b = await leerJson(req);
  const identificador = String(b.identificador || '').trim();
  if (!identificador) return json({ ok: false, error: 'Escribe tu correo o usuario.' }, 400);
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const r = await emailDeIdentificador(admin, identificador);
  if (!r) return json({ ok: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: r.email });
  if (error || !data?.properties?.hashed_token) return json({ ok: true });
  const enlace = enlaceVerificacion(data.properties.hashed_token, 'recovery', '/cuenta/nueva-clave');
  const envio = await enviarCorreo({ para: r.email, ...correoRecuperacion(r.nombres.split(' ')[0], enlace) });
  if (!envio.ok) return json({ ok: false, error: 'No se pudo enviar el correo: ' + envio.error }, 502);
  return json({ ok: true });
}
