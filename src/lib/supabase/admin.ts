import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con la clave secreta (service_role). SOLO en el servidor (rutas API).
 * Salta las políticas RLS: usarlo únicamente para tareas administrativas controladas.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
