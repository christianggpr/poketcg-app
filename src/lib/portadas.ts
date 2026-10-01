// Mejoras 3 · A: portadas de los álbumes (funciones puras, probadas en test/portadas.test.ts).
import type { Coleccion } from './catalogo';
import { esMarcaAgua, type IdMarcaAgua } from './patrones';

/** Los 8 colores de portada de un álbum personalizado (maqueta M3-Nuevo). */
export const COLORES_PORTADA = ['#E2571E', '#1F5FCC', '#1E8A57', '#7C4DDB', '#C99A00', '#D23B30', '#1C2340', '#0E7C86'] as const;
export const COLOR_POR_DEFECTO = '#1F5FCC';
export const MARCA_AGUA_POR_DEFECTO: IdMarcaAgua = 'emblema';

/** Fondos suaves para la portada de un álbum de colección (el logo oficial va encima). */
export const PASTELES = ['#C9B6F2', '#FFE08A', '#BDEBD1', '#BFDAFF', '#FFD1B8', '#F9C8DD', '#BDE7EA', '#EEDFB8'] as const;

function hash(txt: string): number { let h = 0; for (const ch of txt) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

/** Color suave de la portada de una colección: estable por colección (y distinto entre colecciones de una misma serie). */
export function colorPastelDe(set: Pick<Coleccion, 'id' | 's'>): string {
  return PASTELES[hash(set.id) % PASTELES.length];
}

export const esColorHex = (x: unknown): x is string => typeof x === 'string' && /^#[0-9A-Fa-f]{6}$/.test(x);
/** Color guardado del álbum, o el azul por defecto si falta o no es válido. */
export function colorPortada(color: unknown): string { return esColorHex(color) ? color.toUpperCase() : COLOR_POR_DEFECTO; }
export function marcaAgua(m: unknown): IdMarcaAgua { return esMarcaAgua(m) ? m : MARCA_AGUA_POR_DEFECTO; }

/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export function luminancia(hex: string): number {
  const c = hex.replace('#', '');
  const canal = (i: number) => { const v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}
/** Contraste WCAG entre dos colores (≥ 4.5 para texto normal). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/**
 * Texto sobre la portada: blanco con un sombreado oscuro al pie (así todos los colores de la paleta superan 4.5:1);
 * si el color es claro de verdad, texto oscuro sin sombreado.
 */
export function textoSobre(color: string): { color: string; sombreado: boolean } {
  const claro = contraste(color, '#1C2340') >= 4.5 && contraste(color, '#FFFFFF') < 3;
  return claro ? { color: '#1C2340', sombreado: false } : { color: '#FFFFFF', sombreado: contraste(color, '#FFFFFF') < 4.5 };
}
/** Color de fondo efectivo del pie de la portada con el sombreado (mezcla con #1C2340 al 50 %). */
export function mezclarConOscuro(hex: string, parte = 0.5): string {
  const c = hex.replace('#', ''); const o = [0x1C, 0x23, 0x40];
  const mix = [0, 2, 4].map((i, k) => Math.round(parseInt(c.slice(i, i + 2), 16) * (1 - parte) + o[k] * parte));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
