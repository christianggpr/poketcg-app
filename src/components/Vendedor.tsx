'use client';
import { Icono } from './Icono';
import Link from 'next/link';
import type { Reputacion } from '@/lib/coleccion';
import { ALERTAS, INSIGNIAS } from '@/lib/reputacion';

/** "@usuario 4.9 (12) · 37 ventas" con estrella, insignias y enlace al perfil público del vendedor. */
export function VendedorChip({ username, reputacion, enlace = true, corto }: { username: string; reputacion?: Reputacion | null; enlace?: boolean; corto?: boolean }) {
  const r = reputacion || {};
  const nombre = enlace ? <Link href={`/u/${encodeURIComponent(username)}`} className="vendedor-link" data-testid="vendedor-link">@{username}</Link> : <b>@{username}</b>;
  const ventas = r.ventas || 0;
  return (
    <span className="vendedor" data-testid="vendedor-chip">
      {nombre}
      {r.puntaje != null ? <span className="rep-estrellas" title={`${r.resenas} ${r.resenas === 1 ? 'reseña' : 'reseñas'}`}><Icono n="estrella" tam={14} relleno /> {Number(r.puntaje).toFixed(1)}{!corto && r.resenas ? <span className="faint"> ({r.resenas})</span> : null}</span> : null}
      {!corto ? <span className="faint"> · {ventas} {ventas === 1 ? 'venta' : 'ventas'}</span> : null}
      <Insignias reputacion={r} soloIconos />
    </span>
  );
}

/** Insignias del vendedor (iconos con ayuda al pasar el cursor; o con nombre si `soloIconos` es falso). */
export function Insignias({ reputacion, soloIconos }: { reputacion?: Reputacion | null; soloIconos?: boolean }) {
  const r = reputacion || {};
  const lista = (r.insignias || []).filter(i => INSIGNIAS[i]);
  const alerta = r.alerta && ALERTAS[r.alerta] ? ALERTAS[r.alerta] : null;
  if (!lista.length && !alerta) return null;
  return (
    <span className="insignias">
      {lista.map(i => <span key={i} className={`insignia ${soloIconos ? 'mini' : ''}`} title={`${INSIGNIAS[i].nombre}: ${INSIGNIAS[i].ayuda}`} data-testid={`insignia-${i}`}><Icono n={INSIGNIAS[i].icono} tam={14} />{soloIconos ? '' : ' ' + INSIGNIAS[i].nombre}</span>)}
      {alerta ? <span className={`insignia alerta ${soloIconos ? 'mini' : ''}`} title={`${alerta.nombre}: ${alerta.ayuda}`} data-testid="insignia-alerta"><Icono n={alerta.icono} tam={14} />{soloIconos ? '' : ' ' + alerta.nombre}</span> : null}
    </span>
  );
}

/** Estrellas grandes para calificar o mostrar un puntaje. */
export function Estrellas({ valor, onChange, tam = 28 }: { valor: number; onChange?: (n: number) => void; tam?: number }) {
  return (
    <span className="estrellas" role={onChange ? 'radiogroup' : undefined} data-testid="estrellas">
      {[1, 2, 3, 4, 5].map(n => onChange
        ? <button key={n} type="button" className={`estrella ${n <= valor ? 'on' : ''}`} style={{ fontSize: tam }} onClick={() => onChange(n)} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} data-testid={`estrella-${n}`}><Icono n="estrella" tam={tam} relleno={n <= valor} /></button>
        : <span key={n} className={`estrella ${n <= valor ? 'on' : ''}`} style={{ fontSize: tam }}><Icono n="estrella" tam={tam} relleno={n <= valor} /></span>)}
    </span>
  );
}
