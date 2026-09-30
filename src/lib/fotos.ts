'use client';
// Fotos de publicaciones: compresión en el navegador (máx. 1600 px, JPEG) y subida a Supabase Storage.
import { supabaseBrowser } from './supabase/client';

export const BUCKET_FOTOS = 'fotos-publicaciones';

/** Reduce una imagen a como máximo `max` px de lado y la devuelve como JPEG. */
export async function comprimirImagen(file: File, max = 1600, calidad = 0.85): Promise<Blob> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', calidad));
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return blob;
}

/** Sube una foto a la carpeta del usuario y devuelve su URL pública. */
export async function subirFoto(usuarioId: string, publicacionId: string, file: File): Promise<string> {
  const blob = await comprimirImagen(file);
  const nombre = `${usuarioId}/${publicacionId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
  const sb = supabaseBrowser();
  const { error } = await sb.storage.from(BUCKET_FOTOS).upload(nombre, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return sb.storage.from(BUCKET_FOTOS).getPublicUrl(nombre).data.publicUrl;
}

/** Ruta interna del archivo a partir de su URL pública. */
export function rutaDeUrl(url: string): string | null {
  const m = new RegExp(`/object/public/${BUCKET_FOTOS}/(.+)$`).exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Borra fotos del almacenamiento (ignora las que no existen). */
export async function borrarFotos(urls: string[]): Promise<void> {
  const rutas = urls.map(rutaDeUrl).filter((x): x is string => !!x);
  if (!rutas.length) return;
  await supabaseBrowser().storage.from(BUCKET_FOTOS).remove(rutas);
}
