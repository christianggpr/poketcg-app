'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { Campo, Aviso } from '@/components/ui';

export default function Recuperar() {
  const [identificador, setIdentificador] = useState('');
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(''); setEnviando(true);
    try {
      const r = await fetch('/api/auth/recuperar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador }) });
      const j = await r.json();
      if (j.ok) setListo(true); else setError(j.error || 'No se pudo enviar el correo.');
    } catch {
      setError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }
  return (
    <AuthShell titulo="Recuperar contraseña" pie={<Link href="/ingresar">Volver a ingresar</Link>}>
      {listo ? (
        <Aviso tipo="ok">Si el correo o usuario existe, te enviamos un enlace para elegir una contraseña nueva. Revisa también la carpeta de spam.</Aviso>
      ) : (
        <form onSubmit={enviar} className="stack" noValidate>
          <p className="muted">Escribe tu correo o tu nombre de usuario y te enviaremos un enlace para cambiar la contraseña.</p>
          <Campo label="Correo o nombre de usuario">{id => <input id={id} className="input" autoComplete="username" autoCapitalize="none" value={identificador} onChange={e => setIdentificador(e.target.value)} />}</Campo>
          {error ? <Aviso tipo="danger">{error}</Aviso> : null}
          <button className="btn primary block" type="submit" disabled={enviando || !identificador.trim()}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
        </form>
      )}
    </AuthShell>
  );
}
