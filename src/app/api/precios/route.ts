import { supabaseAdmin } from '@/lib/supabase/admin';
import { usuarioActual } from '@/lib/supabase/server';
import { preciosDe } from '@/lib/tcgdex';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST { ids: string[], forzar?: boolean } → { registros, fx } (solo usuarios con sesión). */
export async function POST(req: Request) {
  const user = await usuarioActual();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const b = await leerJson(req);
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (!ids.length) return json({ ok: true, registros: [], fx: null });
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const { registros, fx } = await preciosDe(admin, ids, b.forzar === true);
  return json({ ok: true, registros, fx });
}
