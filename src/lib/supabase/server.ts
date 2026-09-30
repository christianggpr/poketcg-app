import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Cliente de Supabase para componentes de servidor y rutas API, con la sesión del usuario (cookies). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // En componentes de servidor no se pueden escribir cookies; el middleware las renueva.
        }
      }
    }
  });
}

/** Usuario autenticado actual (o null). */
export async function usuarioActual() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
