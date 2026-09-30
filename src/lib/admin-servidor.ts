// Comprobaciones de administrador para rutas API (solo servidor).
import { supabaseServer } from './supabase/server';

export async function esAdminActual(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
  return data?.rol === 'admin';
}

/** ¿La petición trae el secreto de las tareas programadas (Vercel Cron / pg_cron)? */
export function traeSecretoCron(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return auth === `Bearer ${secreto}` || url.searchParams.get('secret') === secreto;
}
