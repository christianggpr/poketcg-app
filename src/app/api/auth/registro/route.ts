import { supabaseAdmin } from '@/lib/supabase/admin';
import { validarRegistro } from '@/lib/validar';
import { enviarCorreo, correoVerificacion } from '@/lib/correo';
import { json, leerJson, enlaceVerificacion } from '@/lib/auth-servidor';
import { appUrl } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const v = validarRegistro(await leerJson(req));
  if (!v.ok) return json({ ok: false, errores: v.errores }, 400);
  const d = v.datos;

  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }

  // Unicidad: usuario, correo y DNI (mensajes claros antes de crear nada)
  const errores: Record<string, string> = {};
  const [porUsername, porEmail, porDni] = await Promise.all([
    admin.from('perfiles').select('id').ilike('username', d.username).maybeSingle(),
    admin.from('perfiles').select('id').ilike('email', d.email).maybeSingle(),
    admin.from('perfiles').select('id').eq('dni', d.dni).maybeSingle()
  ]);
  if (porUsername.data) errores.username = 'Ese nombre de usuario ya está en uso.';
  if (porEmail.data) errores.email = 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.';
  if (porDni.data) errores.dni = 'Ese DNI ya está registrado en otra cuenta.';
  if (Object.keys(errores).length) return json({ ok: false, errores }, 409);

  // Crea la cuenta (sin confirmar) y obtiene el token de verificación
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: d.email,
    password: d.password,
    options: {
      data: { username: d.username.toLowerCase(), nombres: d.nombres, apellidos: d.apellidos, telefono: d.telefono, dni: d.dni, acepto_terminos: true },
      redirectTo: `${appUrl()}/auth/callback`
    }
  });
  if (error || !data?.properties?.hashed_token) {
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ ok: false, errores: { email: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.' } }, 409);
    }
    if (msg.includes('password')) return json({ ok: false, errores: { password: 'La contraseña no cumple los requisitos (mínimo 8 caracteres).' } }, 400);
    return json({ ok: false, error: 'No se pudo crear la cuenta: ' + (error?.message || 'error desconocido') }, 500);
  }

  const enlace = enlaceVerificacion(data.properties.hashed_token, 'signup');
  const correo = correoVerificacion(d.nombres.split(' ')[0], enlace);
  const envio = await enviarCorreo({ para: d.email, ...correo });
  if (!envio.ok) {
    return json({ ok: false, cuentaCreada: true, error: 'La cuenta se creó, pero no se pudo enviar el correo de verificación (' + envio.error + '). Inicia sesión para pedir que se reenvíe.' }, 502);
  }
  return json({ ok: true, email: d.email });
}
