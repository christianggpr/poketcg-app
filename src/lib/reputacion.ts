// Reputación de vendedores (Fase 4): insignias, formato de estrellas y consulta de la vista pública.
import { supabaseBrowser } from './supabase/client';
import type { Reputacion } from './coleccion';

export type VendedorPublico = { id: string; username: string; reputacion: Reputacion | null; estado: 'activo' | 'suspendido'; creado_en: string };
export type ResenaPublica = { id: string; orden_id: string; vendedor_id: string; puntaje: number; comentario: string; respuesta: string | null; respondida_en: string | null; creada: string; comprador: string; orden_numero: number };

export const INSIGNIAS: Record<string, { icono: string; nombre: string; ayuda: string }> = {
  top: { icono: '🏆', nombre: 'Top vendedor', ayuda: 'Más de 50 ventas con 4.7 estrellas o más.' },
  rapido: { icono: '⚡', nombre: 'Confirma rápido', ayuda: 'Elige la fecha de entrega en menos de 24 horas en promedio.' },
  cumple: { icono: '📅', nombre: 'Cumple fechas', ayuda: 'Deja las cartas en la tienda en la fecha prometida o antes (95 % o más).' },
  sin_faltas: { icono: '✅', nombre: 'Sin faltas', ayuda: 'Ninguna orden vencida en los últimos 90 días (con 5 ventas o más).' },
  nuevo: { icono: '🌱', nombre: 'Nuevo', ayuda: 'Menos de 3 ventas completadas todavía.' }
};
export const ALERTAS: Record<string, { icono: string; nombre: string; ayuda: string }> = {
  faltas: { icono: '⚠️', nombre: 'Faltas recientes', ayuda: '2 o más órdenes vencidas sin entregar en los últimos 90 días.' }
};

export const estrellas = (p: number | null | undefined): string => (p == null ? '—' : '★ ' + Number(p).toFixed(1));

/** Reputaciones de varios vendedores (vista pública: nombre de usuario, reputación y estado). */
export async function reputacionesDe(ids: string[]): Promise<Map<string, VendedorPublico>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await supabaseBrowser().from('vendedores_publicos').select('*').in('id', unicos);
  return new Map(((data || []) as VendedorPublico[]).map(v => [v.id, v]));
}

export async function vendedorPorUsername(username: string): Promise<VendedorPublico | null> {
  const { data } = await supabaseBrowser().from('vendedores_publicos').select('*').eq('username', username.toLowerCase()).maybeSingle();
  return (data as VendedorPublico) || null;
}

export async function resenasDe(vendedorId: string, limite = 20): Promise<ResenaPublica[]> {
  const { data } = await supabaseBrowser().from('resenas_publicas').select('*').eq('vendedor_id', vendedorId).order('creada', { ascending: false }).limit(limite);
  return ((data || []) as ResenaPublica[]).map(r => ({ ...r, puntaje: Number(r.puntaje), orden_numero: Number(r.orden_numero) }));
}

export async function calificarOrden(ordenId: string, puntaje: number, comentario: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseBrowser().rpc('calificar_orden', { p_orden: ordenId, p_puntaje: puntaje, p_comentario: comentario });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function responderResena(resenaId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseBrowser().rpc('responder_resena', { p_resena: resenaId, p_texto: texto });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}
