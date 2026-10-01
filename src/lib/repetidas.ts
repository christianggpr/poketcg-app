// Mejoras 2 · B: el álbum es lo principal y cada casilla guarda 1 copia; las repetidas van al Bulk.
//   repetidasEnAlbumes: copias de más en los álbumes por colección (asistente "Ordenar repetidas").
//   desdeBulkParaAlbumes: cartas del Bulk que encajan en una casilla vacía (asistente "Llenar álbumes desde Bulk").
//   posicionesEnBulk: posición que tendrían en un Bulk las entradas movidas (resumen antes de confirmar).
// El idioma del álbum es el de la hoja de álbumes: JP para japonesas; si no, el registrado o "—" (sin idioma).
// Funciones puras (se prueban en test/repetidas.test.ts).
import type { Caja, Entrada } from './coleccion';
import { claveOrdenEntrada, ts } from './coleccion';
import { cmpKeys, type Carta, type Catalogo } from './catalogo';

/** Idioma con el que un álbum por colección agrupa una entrada: JP para colecciones japonesas; si no, el registrado o "—" (álbum "sin idioma"). */
export function idiomaAlbumDe(cat: Catalogo, e: Entrada): string {
  const c = cat.carta(e.carta_id);
  const s = c ? cat.setOf(c) : undefined;
  return s?.rg === 'ja' ? 'JP' : e.idioma || '—';
}
/** Álbumes por colección que el usuario tiene (colección + idioma con al menos una carta, esté donde esté). */
export function albumesQueTengo(cat: Catalogo, entradas: Entrada[]): Set<string> {
  const s = new Set<string>();
  for (const e of entradas) { const c = cat.carta(e.carta_id); if (c) s.add(`${c.s}|${idiomaAlbumDe(cat, e)}`); }
  return s;
}

export type Repetida = {
  entrada: Entrada;
  carta: Carta;
  set: string;
  idioma: string;
  /** Copias que salen de la casilla. */
  copias: number;
  /** true: la entrada completa pasa al Bulk (es una segunda entrada de la misma carta); false: se separan `copias` y 1 se queda. */
  todo: boolean;
  /** La entrada tiene una publicación viva (irá con las copias que salen). */
  publicada: boolean;
};

/** Clave de una casilla: colección | idioma | carta. */
const claveCasilla = (cat: Catalogo, e: Entrada): string | null => (e.album_coleccion && e.carta_id ? `${e.album_coleccion}|${idiomaAlbumDe(cat, e)}|${e.carta_id}` : null);

/**
 * Copias de más en los álbumes por colección. En cada casilla se queda 1 copia (de la entrada sin publicar más
 * antigua; si todas están publicadas, la más antigua); el resto son repetidas.
 */
export function repetidasEnAlbumes(cat: Catalogo, entradas: Entrada[], publicadas: Set<string> = new Set(), soloSet?: string): Repetida[] {
  const porCasilla = new Map<string, Entrada[]>();
  for (const e of entradas) {
    if (soloSet && e.album_coleccion !== soloSet) continue;
    const k = claveCasilla(cat, e);
    if (!k) continue;
    const c = cat.carta(e.carta_id);
    if (!c || c.s !== e.album_coleccion) continue;
    const l = porCasilla.get(k) || [];
    l.push(e);
    porCasilla.set(k, l);
  }
  const out: Repetida[] = [];
  for (const [k, lista] of porCasilla) {
    lista.sort((a, b) => Number(publicadas.has(a.id)) - Number(publicadas.has(b.id)) || ts(a.creado_en) - ts(b.creado_en) || a.id.localeCompare(b.id));
    const [set, idioma] = k.split('|');
    lista.forEach((e, i) => {
      const carta = cat.carta(e.carta_id)!;
      if (i === 0) { if (e.cantidad > 1) out.push({ entrada: e, carta, set, idioma, copias: e.cantidad - 1, todo: false, publicada: publicadas.has(e.id) }); }
      else out.push({ entrada: e, carta, set, idioma, copias: e.cantidad, todo: true, publicada: publicadas.has(e.id) });
    });
  }
  return out.sort((a, b) => a.set.localeCompare(b.set) || a.idioma.localeCompare(b.idioma) || cmpKeys([a.carta.l], [b.carta.l]));
}

export type Candidata = { entrada: Entrada; carta: Carta; set: string; idioma: string; caja: Caja; todo: boolean };

/**
 * Cartas del Bulk que pueden ir a una casilla vacía de un álbum que el usuario tiene (colección + idioma con cartas).
 * Una por casilla (la entrada más antigua, prefiriendo las de 1 copia).
 */
export function desdeBulkParaAlbumes(cat: Catalogo, entradas: Entrada[], cajas: Caja[], soloSet?: string): Candidata[] {
  const albumes = albumesQueTengo(cat, entradas);
  const ocupadas = new Set(entradas.map(e => claveCasilla(cat, e)).filter((k): k is string => !!k));
  const porCaja = new Map(cajas.map(c => [c.id, c]));
  const porCasilla = new Map<string, Candidata>();
  for (const e of entradas) {
    if (!e.caja_id || !e.carta_id) continue;
    const caja = porCaja.get(e.caja_id);
    const c = cat.carta(e.carta_id);
    if (!caja || !c || c.sd) continue;
    if (soloSet && c.s !== soloSet) continue;
    const idioma = idiomaAlbumDe(cat, e);
    if (!albumes.has(`${c.s}|${idioma}`)) continue;
    const k = `${c.s}|${idioma}|${c.id}`;
    if (ocupadas.has(k)) continue;
    const ya = porCasilla.get(k);
    const mejor = !ya || (ya.entrada.cantidad > 1 && e.cantidad === 1) || (ya.entrada.cantidad === e.cantidad && ts(e.creado_en) < ts(ya.entrada.creado_en));
    if (mejor) porCasilla.set(k, { entrada: e, carta: c, set: c.s, idioma, caja, todo: e.cantidad === 1 });
  }
  return [...porCasilla.values()].sort((a, b) => a.set.localeCompare(b.set) || a.idioma.localeCompare(b.idioma) || cmpKeys([a.carta.l], [b.carta.l]));
}

/** Posición que tendrá en el Bulk cada entrada movida (id de la entrada → posición), simulando el orden del Bulk con ellas dentro. */
export function posicionesEnBulk(cat: Catalogo, caja: Caja, entradas: Entrada[], movidas: Entrada[]): { posiciones: Map<string, number>; total: number } {
  const maxPos = entradas.filter(e => e.caja_id === caja.id).reduce((m, e) => Math.max(m, e.posicion || 0), 0);
  const ids = new Set(movidas.map(e => e.id));
  const lista = [
    ...entradas.filter(e => e.caja_id === caja.id && !ids.has(e.id)),
    ...movidas.map((e, i) => ({ ...e, caja_id: caja.id, posicion: maxPos + i + 1, creado_en: e.creado_en || new Date().toISOString() }))
  ].map(e => ({ e, k: claveOrdenEntrada(cat, e, caja) }));
  lista.sort((a, b) => cmpKeys(a.k, b.k) || ts(a.e.creado_en) - ts(b.e.creado_en) || a.e.id.localeCompare(b.e.id));
  const posiciones = new Map<string, number>();
  lista.forEach((x, i) => { if (ids.has(x.e.id)) posiciones.set(x.e.id, i + 1); });
  return { posiciones, total: lista.length };
}

/** Resumen corto de posiciones: "#3, #7–#9". */
export function resumenPosiciones(posiciones: number[]): string {
  const nums = [...new Set(posiciones)].sort((a, b) => a - b);
  const partes: string[] = [];
  let ini = nums[0], fin = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === fin + 1) { fin = nums[i]; continue; }
    partes.push(ini === fin ? `#${ini}` : `#${ini}–#${fin}`);
    ini = fin = nums[i];
  }
  return partes.join(', ');
}
