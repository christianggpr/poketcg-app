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
export const CONDICIONES = ['', 'Perfecta (mint)', 'Casi perfecta', 'Buena', 'Jugada', 'Dañada'] as const;
