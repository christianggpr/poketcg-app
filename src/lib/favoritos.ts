// Favoritos / lista de deseos (Fase 4 · D): cartas que el usuario quiere; la base avisa cuando aparece una oferta.
import { supabaseBrowser } from './supabase/client';

export async function misFavoritos(): Promise<string[]> {
  const { data, error } = await supabaseBrowser().from('favoritos').select('carta_id').order('creado', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as { carta_id: string }[]).map(f => f.carta_id);
}
export async function agregarFavorito(cartaId: string): Promise<void> {
  const { error } = await supabaseBrowser().from('favoritos').insert({ carta_id: cartaId });
  if (error && !/duplicate|unique|23505/i.test(error.message)) throw new Error(error.message);
}
export async function quitarFavorito(cartaId: string): Promise<void> {
  const { error } = await supabaseBrowser().from('favoritos').delete().eq('carta_id', cartaId);
  if (error) throw new Error(error.message);
}
