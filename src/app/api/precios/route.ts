import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { usuarioActual } from '@/lib/supabase/server';
import { preciosDe } from '@/lib/tcgdex';
import { cargarAjustes } from '@/lib/ajustes';
import { tickSiPendiente } from '@/lib/tareas';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** POST { ids: string[], forzar?: boolean } → { registros, fx, ajustes } (solo usuarios con sesión). */
export async function POST(req: Request) {
  const user = await usuarioActual();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const b = await leerJson(req);
  const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const ajustes = await cargarAjustes(admin);
  if (!ids.length) return json({ ok: true, registros: [], fx: null, ajustes });
  const { registros, fx } = await preciosDe(admin, ids, b.forzar === true);
  // Si la tarea diaria quedó a medias (sin pg_cron), cada visita la avanza un poco después de responder.
  after(() => tickSiPendiente(admin, 4000));
  return json({ ok: true, registros, fx, ajustes });
}
