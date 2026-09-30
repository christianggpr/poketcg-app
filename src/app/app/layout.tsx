import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import type { Perfil } from '@/lib/coleccion';
import { AppProviders } from '@/components/AppProviders';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/ingresar?volver=/app');
  const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (!perfil) {
    return (
      <div className="auth-wrap"><div className="auth-card">
        <h1>Falta tu perfil</h1>
        <p className="muted">Tu cuenta existe pero no tiene perfil en la base de datos. Suele pasar si la base de datos se configuró después de crear la cuenta. Escríbenos a info@poketcg.pe o vuelve a registrarte con otro correo.</p>
        <form action="/api/auth/salir" method="post"><button className="btn">Cerrar sesión</button></form>
      </div></div>
    );
  }
  return (
    <AppProviders perfil={perfil as Perfil}>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
