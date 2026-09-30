'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Aviso } from '@/components/ui';

function Contenido() {
  const email = useSearchParams().get('email') || '';
  const [reenviado, setReenviado] = useState(false);
  async function reenviar() {
    await fetch('/api/auth/reenviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identificador: email }) }).catch(() => {});
    setReenviado(true);
  }
  return (
    <div className="stack">
      <Aviso tipo="ok">Te enviamos un correo{email ? <> a <b>{email}</b></> : null} con un enlace para confirmar tu cuenta. Ábrelo desde este mismo dispositivo para entrar directamente.</Aviso>
      <p className="muted small">¿No llega? Revisa la carpeta de spam o correo no deseado. Puede tardar un par de minutos.</p>
      {email ? (reenviado ? <p className="small ok">Listo, enviamos otro correo.</p> : <button className="btn" onClick={reenviar}>Reenviar correo</button>) : null}
    </div>
  );
}

export default function Verificar() {
  return (
    <AuthShell titulo="Confirma tu correo" pie={<Link href="/ingresar">Ir a ingresar</Link>}>
      <Suspense><Contenido /></Suspense>
    </AuthShell>
  );
}
