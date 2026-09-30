import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { origenDe, rutaSegura } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Verifica el token de un correo (registro, reenvío o recuperación) e inicia sesión. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origen = origenDe(req);
  const tokenHash = url.searchParams.get('token_hash') || '';
  const tipo = (url.searchParams.get('type') || 'signup') as EmailOtpType;
  const siguiente = rutaSegura(url.searchParams.get('next'), tipo === 'recovery' ? '/cuenta/nueva-clave' : '/app');
  const destino = new URL(siguiente, origen);

  if (!tokenHash) return NextResponse.redirect(new URL('/ingresar?error=enlace', origen));
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
  if (error) {
    const fallo = new URL('/ingresar', origen);
    fallo.searchParams.set('error', tipo === 'recovery' ? 'recuperacion' : 'enlace');
    return NextResponse.redirect(fallo);
  }
  if (tipo === 'signup' || tipo === 'magiclink') destino.searchParams.set('bienvenida', '1');
  return NextResponse.redirect(destino);
}
