'use client';
import { useId } from 'react';

type CampoProps = {
  label: string;
  error?: string;
  ayuda?: string;
  children: (id: string) => React.ReactNode;
};
/** Campo de formulario con etiqueta, ayuda y error. */
export function Campo({ label, error, ayuda, children }: CampoProps) {
  const id = useId();
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <div className="err">{error}</div> : ayuda ? <div className="small muted" style={{ marginTop: 4 }}>{ayuda}</div> : null}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'warn' | 'ok' | 'danger'; children: React.ReactNode }) {
  return <div className={`notice ${tipo}`}>{children}</div>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="empty">
      <div className="spinner" /> <span className="muted">{texto}</span>
    </div>
  );
}

/** Marca de tiempo relativa: "hace 3 min" */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}
