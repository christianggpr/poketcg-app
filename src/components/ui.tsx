'use client';
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Icono, type NombreIcono } from './Icono';
import { Thumb } from './Thumb';
import type { Carta, Coleccion } from '@/lib/catalogo';

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

/* =====================================================================
   Componentes base del layout v2 (bloque A). Se crean una vez y se reutilizan.
   ===================================================================== */

type Comun = { className?: string; style?: CSSProperties; children?: ReactNode; 'data-testid'?: string };

/** Tarjeta blanca sin borde con sombra. */
export function Tarjeta({ className = '', style, children, ...rest }: Comun) {
  return <div className={`panel ${className}`} style={style} data-testid={rest['data-testid']}>{children}</div>;
}

type BotonProps = Comun & { onClick?: () => void; disabled?: boolean; href?: string; type?: 'button' | 'submit'; icono?: NombreIcono; sm?: boolean; grande?: boolean; block?: boolean; title?: string; 'aria-label'?: string };
function Boton({ clase, className = '', href, icono, sm, grande, block, children, ...rest }: BotonProps & { clase: string }) {
  const cls = `btn ${clase} ${sm ? 'sm' : ''} ${grande ? 'grande' : ''} ${block ? 'block' : ''} ${className}`;
  const contenido = <>{icono ? <Icono n={icono} /> : null}{children}</>;
  if (href) return <Link href={href} className={cls} style={rest.style} title={rest.title} aria-label={rest['aria-label']} data-testid={rest['data-testid']}>{contenido}</Link>;
  return <button type={rest.type || 'button'} className={cls} style={rest.style} onClick={rest.onClick} disabled={rest.disabled} title={rest.title} aria-label={rest['aria-label']} data-testid={rest['data-testid']}>{contenido}</button>;
}
/** Botón principal (azul, texto blanco). */
export const BotonPrimario = (p: BotonProps) => <Boton clase="primary" {...p} />;
/** Botón secundario (blanco con sombra; crema dentro de una tarjeta). */
export const BotonSecundario = (p: BotonProps) => <Boton clase="" {...p} />;
/** Botón del carrito (amarillo). */
export const BotonAcento = (p: BotonProps) => <Boton clase="accent" {...p} />;

/** Chip de filtro o sección; `activo` lo pinta en azul. */
export function Chip({ activo, onClick, href, children, className = '', icono, ...rest }: Comun & { activo?: boolean; onClick?: () => void; href?: string; icono?: NombreIcono; title?: string }) {
  const cls = `chipbtn ${activo ? 'active' : ''} ${className}`;
  const contenido = <>{icono ? <Icono n={icono} tam={16} /> : null}{children}</>;
  if (href) return <Link href={href} className={cls} aria-current={activo ? 'page' : undefined} data-testid={rest['data-testid']} title={rest.title}>{contenido}</Link>;
  return <button type="button" className={cls} onClick={onClick} aria-pressed={activo} data-testid={rest['data-testid']} title={rest.title}>{contenido}</button>;
}

/** Etiqueta pequeña: idioma (info), estado NM/LP/MP (ok), "Propio" (aviso), "Con foto real"… */
export function Etiqueta({ tipo = '', children, className = '', title, ...rest }: Comun & { tipo?: '' | 'info' | 'ok' | 'warn' | 'danger' | 'jp'; title?: string }) {
  return <span className={`pill ${tipo} ${className}`} title={title} data-testid={rest['data-testid']}>{children}</span>;
}
/** Etiqueta de idioma: EN / ES / JP (JP en rojo). */
export const EtiquetaIdioma = ({ idioma }: { idioma: string }) => (idioma ? <Etiqueta tipo={idioma === 'JP' ? 'jp' : 'info'}>{idioma}</Etiqueta> : null);
/** Etiqueta de estado de la carta (NM/LP/MP…). */
export const EtiquetaEstado = ({ estado }: { estado: string }) => (estado ? <Etiqueta tipo={estado === 'NM' ? 'ok' : ''}>{estado}</Etiqueta> : null);

/** Barra de progreso (0–100). */
export function BarraProgreso({ pct, alta, className = '', ...rest }: Comun & { pct: number; alta?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return <div className={`bar ${alta ? 'alta' : ''} ${className}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} data-testid={rest['data-testid']}><div style={{ width: v + '%' }} /></div>;
}

/** Píldora de estado con texto completo (aviso / info / ok / peligro). `bloque` la muestra a lo ancho. */
export function PildoraEstado({ tipo, bloque, icono, children, className = '', ...rest }: Comun & { tipo: 'aviso' | 'info' | 'ok' | 'peligro'; bloque?: boolean; icono?: NombreIcono }) {
  return <span className={`estado ${tipo} ${bloque ? 'bloque' : ''} ${className}`} data-testid={rest['data-testid']}>{icono ? <Icono n={icono} tam={15} /> : null}{children}</span>;
}

/** Línea de avance de una orden: 4 puntos (Pago en revisión → Pagado → En tienda → Entregado). */
export const PASOS_ORDEN = ['Pago en revisión', 'Pagado', 'En tienda', 'Entregado'] as const;
export function LineaAvance({ paso, peligro, pasos = PASOS_ORDEN as unknown as string[] }: { paso: number; peligro?: boolean; pasos?: string[] }) {
  return (
    <div className="avance" aria-label={`Paso ${paso + 1} de ${pasos.length}: ${pasos[paso] || ''}`}>
      {pasos.map((p, i) => <div key={p} className={`paso-av ${i < paso ? 'hecho' : ''} ${i === paso ? (peligro ? 'actual peligro' : 'actual') : ''}`}><span className="punto" />{p}</div>)}
    </div>
  );
}

/** Miniatura de carta (63:88) con radio. `ancho` en px. */
export function MiniCarta({ carta, set, ancho = 54, className = '', alt = '' }: { carta?: Carta | null; set?: Coleccion; ancho?: number; className?: string; alt?: string }) {
  return <span className={`minicarta ${className}`} style={{ width: ancho, height: Math.round(ancho * 88 / 63), display: 'inline-block', flex: 'none' }}><Thumb carta={carta} set={set} alt={alt} className="mini" /></span>;
}

/** Casilla de álbum (hoja de carpeta): la tengo (imagen, número, ×N) o falta (punteada, número y precio en el mercado). */
export function CasillaAlbum({ numero, tengo, cantidad, carta, set, enMercado, onClick, href, nombre }: { numero: string; tengo: boolean; cantidad?: number; carta?: Carta | null; set?: Coleccion; enMercado?: string; onClick?: () => void; href?: string; nombre?: string }) {
  const contenido = tengo ? (
    <>
      <Thumb carta={carta} set={set} alt={nombre || ''} />
      <span className="pocket-n">{numero}</span>
      {cantidad && cantidad > 1 ? <span className="casilla-cant">×{cantidad}</span> : null}
    </>
  ) : (
    <span className="casilla-falta"><b>{numero}</b>{enMercado ? <span className="casilla-mercado">{enMercado}</span> : null}</span>
  );
  const cls = `pocket ${tengo ? 'filled' : 'missing'}`;
  if (href) return <Link href={href} className={cls} title={nombre}>{contenido}</Link>;
  return <div className={cls} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }} title={nombre}>{contenido}</div>;
}

/** Cabecera de pantalla: botón de volver + título (+ acciones a la derecha). */
export function Cabecera({ titulo, volver, volverTexto, extra, children, className = '' }: { titulo?: ReactNode; volver?: string; volverTexto?: string; extra?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`cabecera ${className}`}>
      {volver ? <Link href={volver} className="btn icon volver" aria-label={volverTexto || 'Volver'} title={volverTexto || 'Volver'}><Icono n="izquierda" tam={22} /></Link> : null}
      {titulo ? <h1 className="cabecera-titulo">{titulo}</h1> : children}
      {extra ? <div className="cabecera-extra">{extra}</div> : null}
    </div>
  );
}

/** true en PC (≥ 1024 px): para elegir entre lista (celular) y tabla (PC) sin pintar las dos. */
export function useEsPC(): boolean {
  const [pc, setPc] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const f = () => setPc(mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return pc;
}
