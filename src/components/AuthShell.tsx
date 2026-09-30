import Link from 'next/link';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';

/** Marco de las páginas de cuenta (registro, ingreso, recuperación). */
export function AuthShell({ titulo, children, pie }: { titulo: string; children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <Link href="/" className="auth-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon.svg" alt="" />
        <span><b>{APP_NAME}</b><br /><span className="small muted">{APP_TAGLINE}</span></span>
      </Link>
      <div className="auth-card">
        <h1>{titulo}</h1>
        {children}
      </div>
      {pie ? <div className="auth-links">{pie}</div> : null}
    </div>
  );
}
