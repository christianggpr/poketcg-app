'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Campo, Aviso } from '@/components/ui';

const MENSAJES: Record<string, string> = {
  enlace: 'El enlace no es válido o ya venció. Inicia sesión o pide uno nuevo.',
  recuperacion: 'El enlace para cambiar la contraseña no es válido o ya venció. Pide uno nuevo.',
  sesion: 'Tu sesión terminó. Vuelve a ingresar.'
};

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const volver = params.get('volver') || '/app';
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => MENSAJES[params.get('error') || ''] || '');
  const [noVerificado, setNoVerificado] = useState('');
  const [reenviado, setReenviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(''); setNoVerificado(''); setEnviando(true);
    try {
      const r = await fetch('/api/auth/ingresar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador, password }) });
      const j = await r.json();
      if (j.ok) { router.replace(volver.startsWith('/') ? volver : '/app'); router.refresh(); return; }
      if (j.codigo === 'no_verificado') setNoVerificado(j.email || identificador);
      setError(j.error || 'No se pudo iniciar sesión.');
    } catch {
      setError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }
  async function reenviar() {
    await fetch('/api/auth/reenviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: noVerificado }) }).catch(() => {});
    setReenviado(true);
  }

  return (
    <form onSubmit={enviar} className="stack" noValidate>
      <Campo label="Correo o nombre de usuario">{id => <input id={id} className="input" autoComplete="username" autoCapitalize="none" value={identificador} onChange={e => setIdentificador(e.target.value)} />}</Campo>
      <Campo label="Contraseña">{id => <input id={id} className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />}</Campo>
      {error ? <Aviso tipo={noVerificado ? 'warn' : 'danger'}>{error}{noVerificado ? <div style={{ marginTop: 8 }}>{reenviado ? <span className="ok">Listo: si el correo existe, te enviamos un nuevo enlace.</span> : <button type="button" className="btn sm" onClick={reenviar}>Reenviar correo de verificación</button>}</div> : null}</Aviso> : null}
      <button className="btn primary block" type="submit" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
      <div className="small" style={{ textAlign: 'center' }}><Link href="/recuperar">Olvidé mi contraseña</Link></div>
    </form>
  );
}

export default function Ingresar() {
  return (
    <AuthShell titulo="Ingresar" pie={<><span className="muted">¿Nuevo aquí?</span> <Link href="/registro">Crear cuenta</Link></>}>
      <Suspense><Formulario /></Suspense>
    </AuthShell>
  );
}
