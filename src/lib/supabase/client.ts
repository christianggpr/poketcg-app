'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (clave pública anon; la seguridad la dan las políticas RLS). */
export function supabaseBrowser(): SupabaseClient {
  if (!cliente) {
    cliente = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return cliente;
}
