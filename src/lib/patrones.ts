// Mejoras 3: patrones originales en trazo (marcas de agua) y emblema PokéTCG.
// Son dibujos propios (sin Pokébola, siluetas ni tipografía oficial): llamas, olas, hojas, rayos y estrellas,
// repetidos en mosaico e inclinados ~12°. Se usan como fondo de la app (bloque B) y como marca de agua
// de la portada de los álbumes personalizados (bloque A).

export type IdPatron = 'llamas' | 'olas' | 'hojas' | 'rayos' | 'estrellas';
export type IdFondo = 'liso' | IdPatron | 'aleatorio';
export type IdMarcaAgua = 'emblema' | IdPatron | 'ninguna';

export type Patron = {
  id: IdPatron;
  nombre: string;
  /** Color del trazo en modo claro. */
  color: string;
  /** Trazos dentro de un mosaico de 60 × 60. */
  trazos: { d: string; grosor?: number; relleno?: boolean }[];
  circulos?: { cx: number; cy: number; r: number }[];
};

export const PATRONES: Patron[] = [
  { id: 'llamas', nombre: 'Llamas', color: '#E2571E', trazos: [{ d: 'M30 52c-10 0-16-7-16-15 0-9 8-13 9-22 4 5 6 9 6 13 2-3 3-6 3-10 7 6 14 12 14 20 0 8-7 14-16 14Z' }] },
  { id: 'olas', nombre: 'Olas', color: '#2E6BD6', trazos: [{ d: 'M4 30c8-8 16-8 24 0s16 8 24 0M4 44c8-8 16-8 24 0s16 8 24 0' }] },
  { id: 'hojas', nombre: 'Hojas', color: '#1E8A57', trazos: [{ d: 'M14 46C14 26 28 14 48 12c0 20-12 34-32 34Zm0 0 22-22' }] },
  { id: 'rayos', nombre: 'Rayos', color: '#C99A00', trazos: [{ d: 'M34 8 18 34h12l-4 20 18-28H32l2-18Z' }] },
  { id: 'estrellas', nombre: 'Estrellas', color: '#7C4DDB', trazos: [{ d: 'm30 10 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1 5-11Z', grosor: 2.2 }], circulos: [{ cx: 50, cy: 48, r: 3 }] }
];
export const PATRON_POR_ID: Record<IdPatron, Patron> = Object.fromEntries(PATRONES.map(p => [p.id, p])) as Record<IdPatron, Patron>;
export const esPatron = (x: unknown): x is IdPatron => typeof x === 'string' && x in PATRON_POR_ID;

/** Fondos de la app (bloque B): Liso, los cinco patrones y Aleatorio (cambia cada día). */
export const FONDOS: { id: IdFondo; nombre: string }[] = [
  { id: 'liso', nombre: 'Liso' },
  ...PATRONES.map(p => ({ id: p.id as IdFondo, nombre: p.nombre })),
  { id: 'aleatorio', nombre: 'Aleatorio' }
];
export const FONDO_POR_DEFECTO: IdFondo = 'hojas';
export const INTENSIDAD_POR_DEFECTO = 40;
export const esFondo = (x: unknown): x is IdFondo => typeof x === 'string' && FONDOS.some(f => f.id === x);

/** Patrón que toca hoy con "Aleatorio" (cambia cada día, igual en todos los dispositivos). */
export function patronAleatorio(fecha = new Date()): IdPatron {
  const dia = Math.floor(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86400000);
  return PATRONES[((dia % PATRONES.length) + PATRONES.length) % PATRONES.length].id;
}
/** Patrón efectivo de un fondo elegido (null = liso). */
export function patronDeFondo(fondo: IdFondo, fecha = new Date()): IdPatron | null {
  if (fondo === 'liso') return null;
  if (fondo === 'aleatorio') return patronAleatorio(fecha);
  return fondo;
}
/** Intensidad 0–100 → opacidad real (40 % ≈ 0.08). */
export function opacidadDeIntensidad(intensidad: number): number {
  const i = Math.max(0, Math.min(100, Number.isFinite(intensidad) ? intensidad : INTENSIDAD_POR_DEFECTO));
  return Math.round(i * 0.2) / 100;   // 0 → 0, 40 → 0.08, 100 → 0.20
}

/** Marcas de agua de la portada de un álbum personalizado (bloque A). */
export const MARCAS_AGUA: { id: IdMarcaAgua; nombre: string }[] = [
  { id: 'emblema', nombre: 'Emblema PokéTCG' },
  ...PATRONES.map(p => ({ id: p.id as IdMarcaAgua, nombre: p.nombre })),
  { id: 'ninguna', nombre: 'Ninguna' }
];
export const esMarcaAgua = (x: unknown): x is IdMarcaAgua => typeof x === 'string' && MARCAS_AGUA.some(m => m.id === x);

/** Emblema PokéTCG (carpeta con anillas y una estrella), en un lienzo de 100 × 100. */
export const EMBLEMA = {
  carpeta: { x: 18, y: 10, ancho: 64, alto: 84, radio: 10, grosor: 7 },
  anillas: [{ cx: 18, cy: 30 }, { cx: 18, cy: 52 }, { cx: 18, cy: 74 }],
  estrella: 'm50 30 6 12 13 2-9.5 9 2.3 13L50 60l-11.8 6 2.3-13-9.5-9 13-2 6-12Z'
};
