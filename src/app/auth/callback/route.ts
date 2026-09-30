import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { origenDe, rutaSegura } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Compatibilidad con los enlaces PKCE (?code=) que genera Supabase en sus propios correos. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origen = origenDe(req);
  const code = url.searchParams.get('code');
  const siguiente = rutaSegura(url.searchParams.get('next'));
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(siguiente, origen));
  }
  return NextResponse.redirect(new URL('/ingresar?error=enlace', origen));
}
