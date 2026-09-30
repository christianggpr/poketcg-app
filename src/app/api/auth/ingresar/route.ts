import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { json, leerJson, emailDeIdentificador } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const b = await leerJson(req);
  const identificador = String(b.identificador || '').trim();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!identificador || !password) return json({ ok: false, error: 'Escribe tu correo o usuario y tu contraseña.' }, 400);

  let email = identificador.toLowerCase();
  if (!identificador.includes('@')) {
    let admin;
    try {
      admin = supabaseAdmin();
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 500);
    }
    const r = await emailDeIdentificador(admin, identificador);
    if (!r) return json({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
    email = r.email;
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not confirmed')) return json({ ok: false, codigo: 'no_verificado', email, error: 'Tu correo todavía no está verificado. Revisa tu bandeja (y la carpeta de spam) o pide que te reenviemos el correo.' }, 403);
    if (msg.includes('invalid')) return json({ ok: false, error: 'Correo/usuario o contraseña incorrectos.' }, 401);
    return json({ ok: false, error: 'No se pudo iniciar sesión: ' + error.message }, 500);
  }
  return json({ ok: true });
}
