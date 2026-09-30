// Mazos meta (Fase 2 · D): lectura de arquetipos y variantes desde la base (los llena la tarea diaria).
import { supabaseBrowser } from './supabase/client';
import type { Arquetipo, Variante } from './mazos-core';

export async function cargarMazos(): Promise<{ arquetipos: Arquetipo[]; variantes: Variante[]; actualizado: string | null }> {
  const sb = supabaseBrowser();
  const [a, v, m] = await Promise.all([
    sb.from('mazos_arquetipos').select('*').order('orden'),
    sb.from('mazos_variantes').select('*').order('arquetipo_id').order('orden'),
    sb.from('ajustes_globales').select('valor').eq('clave', 'mazos').maybeSingle()
  ]);
  if (a.error) throw new Error(a.error.message);
  if (v.error) throw new Error(v.error.message);
  const actualizado = (m.data?.valor as { actualizado?: string } | null)?.actualizado || null;
  return { arquetipos: (a.data || []) as Arquetipo[], variantes: (v.data || []) as Variante[], actualizado };
}

/** URL del icono de un Pokémon en Limitless (dragapult → imagen). */
export const urlIcono = (icono: string) => `https://r2.limitlesstcg.net/pokemon/gen9/${encodeURIComponent(icono)}.png`;
