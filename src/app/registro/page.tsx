'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Campo, Aviso } from '@/components/ui';
import { validarRegistro, type DatosRegistro, type Errores } from '@/lib/validar';

const inicial: DatosRegistro = { nombres: '', apellidos: '', username: '', email: '', telefono: '', dni: '', password: '', aceptaTerminos: false };

export default function Registro() {
  const router = useRouter();
  const [d, setD] = useState<DatosRegistro>(inicial);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const set = <K extends keyof DatosRegistro>(k: K, v: DatosRegistro[K]) => { setD(x => ({ ...x, [k]: v })); setErrores(e => ({ ...e, [k]: undefined })); };

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    const v = validarRegistro(d);
    if (!v.ok) { setErrores(v.errores); return; }
    setEnviando(true);
    try {
      const r = await fetch('/api/auth/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v.datos) });
      const j = await r.json();
      if (j.ok) { router.push('/verificar?email=' + encodeURIComponent(v.datos.email)); return; }
      if (j.errores) setErrores(j.errores);
      if (j.error) setError(j.error);
      if (!j.errores && !j.error) setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
    } catch {
      setError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell titulo="Crear cuenta" pie={<><span className="muted">¿Ya tienes cuenta?</span> <Link href="/ingresar">Ingresar</Link></>}>
      <form onSubmit={enviar} className="stack" noValidate>
        <div className="form-grid">
          <Campo label="Nombres" error={errores.nombres}>{id => <input id={id} className="input" autoComplete="given-name" value={d.nombres} onChange={e => set('nombres', e.target.value)} />}</Campo>
          <Campo label="Apellidos" error={errores.apellidos}>{id => <input id={id} className="input" autoComplete="family-name" value={d.apellidos} onChange={e => set('apellidos', e.target.value)} />}</Campo>
        </div>
        <Campo label="Correo electrónico" error={errores.email} ayuda="Te enviaremos un enlace para confirmarlo.">{id => <input id={id} className="input" type="email" inputMode="email" autoComplete="email" value={d.email} onChange={e => set('email', e.target.value)} />}</Campo>
        <div className="form-grid">
          <Campo label="Celular" error={errores.telefono} ayuda="9 dígitos, empieza con 9.">{id => <input id={id} className="input" inputMode="numeric" autoComplete="tel-national" maxLength={9} value={d.telefono} onChange={e => set('telefono', e.target.value.replace(/\D/g, ''))} />}</Campo>
          <Campo label="DNI" error={errores.dni} ayuda="8 dígitos. Nunca se muestra a otros usuarios.">{id => <input id={id} className="input" inputMode="numeric" maxLength={8} value={d.dni} onChange={e => set('dni', e.target.value.replace(/\D/g, ''))} />}</Campo>
        </div>
        <Campo label="Nombre de usuario" error={errores.username} ayuda="De 3 a 20 letras, números o guion bajo. Servirá para ingresar y para que otros te encuentren.">{id => <input id={id} className="input" autoComplete="username" autoCapitalize="none" maxLength={20} value={d.username} onChange={e => set('username', e.target.value.replace(/\s/g, ''))} />}</Campo>
        <Campo label="Contraseña" error={errores.password} ayuda="Mínimo 8 caracteres.">{id => <input id={id} className="input" type="password" autoComplete="new-password" value={d.password} onChange={e => set('password', e.target.value)} />}</Campo>
        <div className={`field ${errores.aceptaTerminos ? 'invalid' : ''}`}>
          <label className="check">
            <input type="checkbox" checked={d.aceptaTerminos} onChange={e => set('aceptaTerminos', e.target.checked)} />
            <span>Acepto los <Link href="/terminos" target="_blank">términos de uso</Link> y la <Link href="/privacidad" target="_blank">política de privacidad</Link>.</span>
          </label>
          {errores.aceptaTerminos ? <div className="err">{errores.aceptaTerminos}</div> : null}
        </div>
        {error ? <Aviso tipo="danger">{error}</Aviso> : null}
        <button className="btn primary block" type="submit" disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>
    </AuthShell>
  );
}
