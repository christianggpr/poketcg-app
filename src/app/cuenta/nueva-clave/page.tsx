'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Campo, Aviso } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function NuevaClave() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [sesion, setSesion] = useState<boolean | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setSesion(!!data.user));
  }, []);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== password2) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setEnviando(false);
    if (error) return setError('No se pudo cambiar la contraseña: ' + error.message);
    router.replace('/app?clave=ok');
    router.refresh();
  }

  return (
    <AuthShell titulo="Nueva contraseña" pie={<Link href="/ingresar">Volver a ingresar</Link>}>
      {sesion === false ? (
        <Aviso tipo="warn">El enlace venció o ya se usó. <Link href="/recuperar">Pide uno nuevo</Link>.</Aviso>
      ) : (
        <form onSubmit={enviar} className="stack" noValidate>
          <Campo label="Contraseña nueva" ayuda="Mínimo 8 caracteres.">{id => <input id={id} className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />}</Campo>
          <Campo label="Repite la contraseña">{id => <input id={id} className="input" type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} />}</Campo>
          {error ? <Aviso tipo="danger">{error}</Aviso> : null}
          <button className="btn primary block" type="submit" disabled={enviando || sesion !== true}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
        </form>
      )}
    </AuthShell>
  );
}
