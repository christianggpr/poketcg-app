// Utilidades de autenticación para las rutas API (solo servidor).
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appUrl } from './config';
import { RE_EMAIL, RE_USERNAME } from './validar';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Lee el cuerpo JSON de la petición sin lanzar errores. */
export async function leerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Correo (en minúsculas) para un identificador que puede ser correo o nombre de usuario. */
export async function emailDeIdentificador(admin: SupabaseClient, identificador: string): Promise<{ email: string; nombres: string } | null> {
  const id = String(identificador || '').trim();
  if (!id) return null;
  if (id.includes('@')) {
    if (!RE_EMAIL.test(id)) return null;
    const { data } = await admin.from('perfiles').select('email, nombres').ilike('email', id.toLowerCase()).maybeSingle();
    return data ? { email: data.email, nombres: data.nombres } : { email: id.toLowerCase(), nombres: '' };
  }
  if (!RE_USERNAME.test(id)) return null;
  const { data } = await admin.from('perfiles').select('email, nombres').ilike('username', id).maybeSingle();
  return data ? { email: data.email, nombres: data.nombres } : null;
}

export type TipoEnlace = 'signup' | 'magiclink' | 'recovery';

/** Enlace de la app que verifica el token y abre sesión. */
export function enlaceVerificacion(tokenHash: string, tipo: TipoEnlace, siguiente?: string): string {
  const u = new URL('/auth/confirmar', appUrl() + '/');
  u.searchParams.set('token_hash', tokenHash);
  u.searchParams.set('type', tipo);
  if (siguiente) u.searchParams.set('next', siguiente);
  return u.toString();
}

/** Ruta interna segura para redirigir tras iniciar sesión (evita enlaces a otros sitios). */
export function rutaSegura(s: string | null | undefined, porDefecto = '/app'): string {
  if (!s || !s.startsWith('/') || s.startsWith('//')) return porDefecto;
  return s;
}

/** Origen real de la petición (respeta el dominio con el que entró el usuario, también detrás de Vercel). */
export function origenDe(req: Request): string {
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || new URL(req.url).host;
  const proto = h.get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
