import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { AdminPanel } from '@/components/vistas/Admin';
import { APP_NAME } from '@/lib/config';

export const metadata = { title: 'Administración' };

export default async function PaginaAdmin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/ingresar?volver=/admin');
  const { data: perfil } = await supabase.from('perfiles').select('rol, username').eq('id', user.id).maybeSingle();
  if (!perfil || perfil.rol !== 'admin') {
    return <div className="auth-wrap"><div className="auth-card"><h1>Solo administradores</h1><p className="muted">Tu cuenta (@{perfil?.username}) no tiene permisos de administración. <Link href="/app">Volver a la app</Link></p></div></div>;
  }
  return (
    <div id="app">
      <header className="topbar"><div className="brand"><div className="brand-name">{APP_NAME} · Admin</div></div><div className="topbar-right"><span className="chip">@{perfil.username}</span></div></header>
      <main id="main"><AdminPanel /></main>
    </div>
  );
}
