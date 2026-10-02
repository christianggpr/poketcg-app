// Mejoras 5 · B: tipos de álbum al crear (Colección oficial · Un Pokémon · Un tipo · Un ilustrador · Cartas sueltas).
// Funciones puras: qué cartas del catálogo le corresponden a cada tipo, cuántas tengo y cómo se describe el álbum.
import { TYPE_ES, fold, nombreColeccion, type Carta, type Catalogo, type IdiomaNombres } from './catalogo';
import type { Album, Entrada } from './coleccion';
import { cartasPorEspecie } from './pokedex';
import { CADENA } from './evoluciones-datos';

export type TipoAlbum = 'coleccion' | 'pokemon' | 'tipo' | 'ilustrador' | 'libre';
export type ParametrosAlbum = {
  set?: string;          // coleccion: id de la colección
  idioma?: string;       // coleccion: EN/ES/JP…; pokemon: '' (todos) | EN | ES | JP
  dex?: number;          // pokemon: n.º de Pokédex nacional
  evoluciones?: boolean; // pokemon: incluir la línea evolutiva
  tipo?: string;         // tipo: energía (Grass, Fire…)
  ilustrador?: string;   // ilustrador: nombre tal como está en el catálogo
};
export type TipoAlbumInfo = { id: TipoAlbum; nombre: string; detalle: string; color: string; etiqueta: string };

/** Las cinco tarjetas del paso 1 (maquetas M5-PC-Nuevo / M5-Nuevo). */
export const TIPOS_ALBUM: TipoAlbumInfo[] = [
  { id: 'coleccion', nombre: 'Colección oficial', detalle: 'Todas las cartas de una colección, en orden, en un idioma.', color: '#C9B6F2', etiqueta: 'Colección' },
  { id: 'pokemon', nombre: 'Un Pokémon', detalle: 'Todas las cartas de un Pokémon (ej. Bulbasaur), de todas las colecciones.', color: '#4CC97A', etiqueta: 'Nº 0001' },
  { id: 'tipo', nombre: 'Un tipo', detalle: 'Cartas de un tipo de energía (ej. Planta). Tú eliges cuáles.', color: '#1E8A57', etiqueta: 'Planta' },
  { id: 'ilustrador', nombre: 'Un ilustrador', detalle: 'Todas las cartas de un artista (ej. Mitsuhiro Arita).', color: '#7C4DDB', etiqueta: 'Ilustrador' },
  { id: 'libre', nombre: 'Cartas sueltas', detalle: 'Libre: pocas cartas de varias colecciones, en el orden que quieras.', color: '#E2571E', etiqueta: 'Libre' }
];
export const esTipoAlbum = (s: unknown): s is TipoAlbum => TIPOS_ALBUM.some(t => t.id === s);
export const tipoDeAlbum = (a: Pick<Album, 'tipo_album'> | null | undefined): TipoAlbum => (esTipoAlbum(a?.tipo_album) ? a!.tipo_album as TipoAlbum : 'libre');
export const NOMBRE_TIPO: Record<TipoAlbum, string> = { coleccion: 'Colección', pokemon: 'Pokémon', tipo: 'Tipo', ilustrador: 'Ilustrador', libre: 'Libre' };

/** Hasta cuántas cartas se rellena el álbum solo al crearlo (un ilustrador con más empieza vacío con sugerencias, como "Un tipo"). */
export const LIMITE_AUTO = 300;

/** Especies de la misma línea evolutiva (incluida la propia), en orden de n.º nacional. */
export function lineaEvolutiva(dex: number): number[] {
  const cadena = CADENA[dex - 1];
  if (!cadena) return [dex];
  const out: number[] = [];
  for (let i = 0; i < CADENA.length; i++) if (CADENA[i] === cadena) out.push(i + 1);
  return out;
}

const fecha = (cat: Pick<Catalogo, 'setOf'>, c: Carta) => cat.setOf(c)?.d || '';
const numero = (c: Carta) => { const n = parseInt(c.l, 10); return Number.isFinite(n) ? n : 9999; };
/** Orden por fecha de colección (antiguas primero) y número impreso. */
export const ordenPorFecha = (cat: Pick<Catalogo, 'setOf'>) => (a: Carta, b: Carta) => fecha(cat, a).localeCompare(fecha(cat, b)) || a.s.localeCompare(b.s) || numero(a) - numero(b) || a.l.localeCompare(b.l);

/** ¿La carta entra en el grupo de idioma elegido? '' = todas; JP = colecciones japonesas; EN/ES (u otro) = internacionales. */
export function cumpleIdioma(cat: Pick<Catalogo, 'setOf'>, c: Carta, idioma?: string | null): boolean {
  if (!idioma) return true;
  const ja = cat.setOf(c)?.rg === 'ja';
  return idioma === 'JP' ? ja : !ja;
}

/**
 * Cartas del catálogo que le corresponden a un álbum según su tipo y parámetros:
 * pokemon → las de esa especie (y su línea evolutiva si se pidió), por fecha; ilustrador → las de ese artista, por fecha;
 * tipo → las de ese tipo de energía (candidatas para elegir), por fecha; coleccion → las de la colección en su orden; libre → ninguna.
 */
export function cartasDeTipoAlbum(cat: Pick<Catalogo, 'cards' | 'setOf' | 'cartasDe'>, tipo: TipoAlbum, p: ParametrosAlbum): Carta[] {
  if (tipo === 'coleccion') return p.set ? cat.cartasDe(p.set).filter(c => !c.sd) : [];
  if (tipo === 'pokemon') {
    if (!p.dex) return [];
    const especies = p.evoluciones ? lineaEvolutiva(p.dex) : [p.dex];
    const porEspecie = cartasPorEspecie(cat);
    const vistas = new Set<string>();
    const lista: Carta[] = [];
    for (const d of especies) for (const c of porEspecie.get(d) || []) { if (vistas.has(c.id) || !cumpleIdioma(cat, c, p.idioma)) continue; vistas.add(c.id); lista.push(c); }
    return lista.sort(ordenPorFecha(cat));
  }
  if (tipo === 'ilustrador') { const il = fold(p.ilustrador); return il ? cat.cards.filter(c => !c.sd && fold(c.il) === il && cumpleIdioma(cat, c, p.idioma)).sort(ordenPorFecha(cat)) : []; }
  if (tipo === 'tipo') return p.tipo ? cat.cards.filter(c => !c.sd && c.c === 'P' && !!c.t && c.t.includes(p.tipo!) && cumpleIdioma(cat, c, p.idioma)).sort(ordenPorFecha(cat)) : [];
  return [];
}

/** Cuántas de esas cartas tengo (ids distintos con alguna copia). */
export function cuantasTengo(cartas: Carta[], entradas: Pick<Entrada, 'carta_id'>[]): number {
  const mias = new Set(entradas.map(e => e.carta_id).filter(Boolean));
  return cartas.filter(c => mias.has(c.id)).length;
}

/** ¿Se rellena solo al crearlo (pokemon, coleccion e ilustrador con pocas) o empieza vacío con sugerencias (tipo e ilustrador con muchas)? */
export function rellenaSolo(tipo: TipoAlbum, total: number): boolean {
  if (tipo === 'pokemon' || tipo === 'coleccion') return true;
  if (tipo === 'ilustrador') return total <= LIMITE_AUTO;
  return false;
}

/** Páginas necesarias para N cartas con una cuadrícula dada. */
export const paginasPara = (n: number, columnas: number, filas: number): number => Math.max(1, Math.ceil(n / Math.max(1, columnas * filas)));

/** Subtítulo del álbum en la lista ("Bulbasaur + evoluciones · EN", "Tipo Planta", "Mitsuhiro Arita"). */
export function descripcionTipo(cat: Pick<Catalogo, 'especie' | 'coleccion'>, a: Pick<Album, 'tipo_album' | 'parametros'>, idiomaNombres: IdiomaNombres): string {
  const t = tipoDeAlbum(a);
  const p = (a.parametros || {}) as ParametrosAlbum;
  if (t === 'pokemon') {
    const sp = p.dex ? cat.especie(p.dex) : undefined;
    const nombre = sp ? (idiomaNombres === 'ja' ? sp[3] : idiomaNombres === 'es' ? sp[2] : sp[1]) || sp[1] : `Nº ${p.dex || '?'}`;
    return `${nombre}${p.evoluciones ? ' + evoluciones' : ''}${p.idioma ? ` · ${p.idioma}` : ''}`;
  }
  if (t === 'tipo') return `Tipo ${TYPE_ES[p.tipo || ''] || p.tipo || '?'}${p.idioma ? ` · ${p.idioma}` : ''}`;
  if (t === 'ilustrador') return `${p.ilustrador || 'Ilustrador'}${p.idioma ? ` · ${p.idioma}` : ''}`;
  if (t === 'coleccion') return `${nombreColeccion(cat.coleccion(p.set), idiomaNombres)}${p.idioma ? ` · ${p.idioma}` : ''}`;
  return '';
}
