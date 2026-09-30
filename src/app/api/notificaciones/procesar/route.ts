import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { mantenimientoRapido } from '@/lib/notificar';
import { json } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Envía los correos pendientes (lo llama la app después de una acción que genera avisos). Solo usuarios con sesión. */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  try {
    const r = await mantenimientoRapido(supabaseAdmin(), true);
    return json({ ok: true, ...r });
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
}
