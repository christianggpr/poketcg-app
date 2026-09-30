// Órdenes (solo servidor): limpieza de fotos de publicaciones agotadas.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Al venderse la última copia, las fotos de la publicación se borran del almacenamiento. */
export async function borrarFotosVendidas(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { data } = await admin.from('publicaciones').select('id, fotos').in('id', ids);
  const rutas = (data || []).flatMap(p => ((p.fotos as string[]) || []).map(u => /\/object\/public\/fotos-publicaciones\/(.+)$/.exec(u)?.[1]).filter((x): x is string => !!x).map(decodeURIComponent));
  if (rutas.length) await admin.storage.from('fotos-publicaciones').remove(rutas).catch(() => null);
  if (data?.length) await admin.from('publicaciones').update({ fotos: [] }).in('id', ids);
}
