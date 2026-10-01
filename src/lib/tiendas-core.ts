// Utilidades puras de tiendas (sirven en el servidor y en el navegador).

/** Enlace "cómo llegar": el que puso el administrador o una búsqueda en Google Maps por coordenadas o dirección. */
export function enlaceMapa(t: { mapa_url?: string | null; lat?: number | null; lon?: number | null; direccion: string; distrito: string; nombre: string }): string {
  if (t.mapa_url) return t.mapa_url;
  if (t.lat != null && t.lon != null) return `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([t.nombre, t.direccion, t.distrito, 'Perú'].filter(Boolean).join(', '))}`;
}
