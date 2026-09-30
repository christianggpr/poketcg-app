import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarCorreo, correoVerificacion } from '@/lib/correo';
import { json, leerJson, emailDeIdentificador, enlaceVerificacion } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Reenvía el correo de verificación (enlace mágico: al abrirlo se confirma el correo y se inicia sesión). */
export async function POST(req: Request) {
  const b = await leerJson(req);
  const identificador = String(b.identificador || b.email || '').trim();
  if (!identificador) return json({ ok: false, error: 'Escribe tu correo o usuario.' }, 400);
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const r = await emailDeIdentificador(admin, identificador);
  // Respuesta igual exista o no la cuenta (no revela qué correos están registrados)
  if (!r) return json({ ok: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: r.email });
  if (error || !data?.properties?.hashed_token) return json({ ok: true });
  const enlace = enlaceVerificacion(data.properties.hashed_token, 'magiclink');
  const envio = await enviarCorreo({ para: r.email, ...correoVerificacion(r.nombres.split(' ')[0], enlace) });
  if (!envio.ok) return json({ ok: false, error: 'No se pudo enviar el correo: ' + envio.error }, 502);
  return json({ ok: true });
}
