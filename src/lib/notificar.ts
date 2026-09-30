// Fase 3 · notificaciones: la base las crea (tabla `notificaciones`) y el servidor envía los correos
// pendientes (Resend). WhatsApp en etapa 1: el administrador envía con un toque desde /admin (enlace
// wa.me con el mensaje ya escrito); `enviarWhatsApp` es la interfaz para pasar a la etapa 2 (Cloud API).
import type { SupabaseClient } from '@supabase/supabase-js';
import { appUrl } from './config';
import { correoNotificacion, enviarCorreo } from './correo';

export type Notificacion = {
  id: number; usuario_id: string; tipo: string; titulo: string; cuerpo: string; enlace: string | null;
  datos: Record<string, unknown>; canales: string[]; leida_en: string | null; enviada_en: string | null; creada: string;
};

/** Envía por correo las notificaciones pendientes (máx. `limite`). Devuelve cuántas se enviaron. */
export async function procesarNotificacionesPendientes(admin: SupabaseClient, limite = 40): Promise<{ enviadas: number; errores: number }> {
  const { data, error } = await admin.from('notificaciones').select('*').is('enviada_en', null).contains('canales', ['correo']).order('id').limit(limite);
  if (error || !data?.length) return { enviadas: 0, errores: 0 };
  const ids = [...new Set((data as Notificacion[]).map(n => n.usuario_id))];
  const { data: perfiles } = await admin.from('perfiles').select('id, email, nombres').in('id', ids);
  const porId = new Map((perfiles || []).map(p => [p.id as string, p as { email: string; nombres: string }]));
  let enviadas = 0, errores = 0;
  for (const n of data as Notificacion[]) {
    const p = porId.get(n.usuario_id);
    const ahora = new Date().toISOString();
    if (!p || !p.email) { await admin.from('notificaciones').update({ enviada_en: ahora, datos: { ...n.datos, correo_error: 'sin correo' } }).eq('id', n.id); continue; }
    const url = n.enlace ? (n.enlace.startsWith('http') ? n.enlace : appUrl() + n.enlace) : appUrl() + '/app/notificaciones';
    const c = correoNotificacion(p.nombres || '', n.titulo, n.cuerpo, url);
    const r = await enviarCorreo({ para: p.email, ...c });
    if (r.ok) enviadas++; else errores++;
    await admin.from('notificaciones').update({ enviada_en: ahora, datos: r.ok ? n.datos : { ...n.datos, correo_error: r.error } }).eq('id', n.id);
  }
  return { enviadas, errores };
}

/** Texto y enlace wa.me para que el administrador envíe un aviso por WhatsApp con un toque (etapa 1). */
export function enlaceWhatsApp(telefono: string | null | undefined, texto: string): string | null {
  const t = String(telefono || '').replace(/\D/g, '');
  if (!/^9\d{8}$/.test(t)) return null;
  return `https://wa.me/51${t}?text=${encodeURIComponent(texto)}`;
}

/**
 * Interfaz para la etapa 2 (WhatsApp Business Cloud API). Hoy devuelve el enlace wa.me que el
 * administrador abre desde /admin; cuando exista la integración, aquí se llamará a la API de Meta.
 */
export async function enviarWhatsApp(usuario: { telefono: string | null }, plantilla: string, datos: { texto: string }): Promise<{ ok: boolean; modo: 'manual' | 'api'; url?: string }> {
  const url = enlaceWhatsApp(usuario.telefono, datos.texto);
  void plantilla;
  return url ? { ok: true, modo: 'manual', url } : { ok: false, modo: 'manual' };
}

let ultimoMantenimiento = 0;
/** Cada pocos minutos: vence compras sin comprobante y envía correos pendientes (barato; lo llaman el tick y las visitas). */
export async function mantenimientoRapido(admin: SupabaseClient, forzar = false): Promise<{ vencidos: number; enviadas: number } | null> {
  if (!forzar && Date.now() - ultimoMantenimiento < 120000) return null;
  ultimoMantenimiento = Date.now();
  let vencidos = 0;
  try { const { data } = await admin.rpc('vencer_pagos'); vencidos = (data as { vencidos?: number } | null)?.vencidos || 0; } catch { /* sin 0003 aún */ }
  const r = await procesarNotificacionesPendientes(admin).catch(() => ({ enviadas: 0, errores: 0 }));
  return { vencidos, enviadas: r.enviadas };
}
