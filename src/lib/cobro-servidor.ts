// Datos de cobro del vendedor (solo servidor): se guardan cifrados en `datos_cobro`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { descifrar } from './cifrado';

export type DatosCobro = { metodo: 'yape' | 'plin' | 'banco'; titular: string; banco: string; numero: string; cuenta: string; cci: string; actualizado?: string };

export async function leerDatosCobro(admin: SupabaseClient, usuarioId: string): Promise<DatosCobro | null> {
  const { data } = await admin.from('datos_cobro').select('*').eq('usuario_id', usuarioId).maybeSingle();
  if (!data) return null;
  try {
    const priv = JSON.parse(descifrar(data.cifrado as string)) as { numero?: string; cuenta?: string; cci?: string };
    return { metodo: data.metodo, titular: data.titular, banco: data.banco, numero: priv.numero || '', cuenta: priv.cuenta || '', cci: priv.cci || '', actualizado: data.actualizado };
  } catch { return { metodo: data.metodo, titular: data.titular, banco: data.banco, numero: '', cuenta: '', cci: '', actualizado: data.actualizado }; }
}

/** Varios usuarios de una vez (para el Excel de pagos). */
export async function leerDatosCobroVarios(admin: SupabaseClient, ids: string[]): Promise<Map<string, DatosCobro>> {
  const m = new Map<string, DatosCobro>();
  if (!ids.length) return m;
  const { data } = await admin.from('datos_cobro').select('*').in('usuario_id', ids);
  for (const d of data || []) {
    try {
      const priv = JSON.parse(descifrar(d.cifrado as string)) as { numero?: string; cuenta?: string; cci?: string };
      m.set(d.usuario_id as string, { metodo: d.metodo, titular: d.titular, banco: d.banco, numero: priv.numero || '', cuenta: priv.cuenta || '', cci: priv.cci || '', actualizado: d.actualizado });
    } catch { /* clave cambiada: se pide de nuevo al vendedor */ }
  }
  return m;
}
