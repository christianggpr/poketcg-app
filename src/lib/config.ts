// Datos generales de la app. Cambiar el nombre visible aquí lo cambia en toda la app y en los correos.
export const APP_NAME = 'PokéTCG';
export const APP_TAGLINE = 'Tu colección Pokémon TCG, ubicada al instante';
export const APP_VERSION = '2.0.0-fase1';

/** URL pública de la app (sin barra final). En Vercel: NEXT_PUBLIC_APP_URL=https://poketcg.pe */
export function appUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` || 'http://localhost:3000';
  return u.replace(/\/+$/, '');
}

export const EMAIL_FROM = process.env.EMAIL_FROM || `${APP_NAME} <no-reply@poketcg.pe>`;
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@poketcg.pe';

export const IDIOMAS_CARTA = ['ES', 'EN', 'JP', 'PT', 'FR', 'DE', 'IT', 'Otro'] as const;
export const ACABADOS = ['', 'Normal', 'Reverse', 'Holo', 'Otra'] as const;
// Estado de conservación: escala estándar del coleccionismo (Fase 4). Los valores antiguos se convirtieron en la base.
export const CONDICIONES = ['', 'NM', 'LP', 'MP', 'HP', 'DM'] as const;
export const ETIQUETA_CONDICION: Record<string, string> = { NM: 'NM · Casi nueva (Near Mint)', LP: 'LP · Poco jugada (Lightly Played)', MP: 'MP · Jugada (Moderately Played)', HP: 'HP · Muy jugada (Heavily Played)', DM: 'DM · Dañada (Damaged)' };
export const DESCRIPCION_CONDICION: Record<string, string> = { NM: 'Sin marcas a simple vista; bordes y superficie impecables.', LP: 'Marcas mínimas (un borde blanqueado, una rayita leve).', MP: 'Desgaste visible: varios bordes blanqueados o rayas, sin dobleces.', HP: 'Desgaste fuerte: dobleces leves, bordes muy marcados, raspones.', DM: 'Doblada, rota, con agua o escritura.' };
/** Convierte textos libres (v1, importaciones, etiquetas antiguas) a la escala NM/LP/MP/HP/DM. */
export function normalizarCondicion(texto: string | null | undefined): string {
  const t = String(texto || '').trim().toLowerCase();
  if (!t) return '';
  if (/^(nm|near ?mint|mint|m|perfecta|casi nueva|nueva|excelente)/.test(t)) return 'NM';
  if (/^(lp|light|poco|casi perfecta|muy buena|ligeramente)/.test(t)) return 'LP';
  if (/^(mp|moder|jugada|buena|regular|usada)/.test(t)) return 'MP';
  if (/^(hp|heav|muy jugada|mala|desgast)/.test(t)) return 'HP';
  if (/^(dm|d|dañ|dan|rota|doblada|poor|damaged)/.test(t)) return 'DM';
  return '';
}
