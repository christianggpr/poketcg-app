// Mejoras 4 · D y E: filtros compartidos del Mercado, de Buscar en mi colección y del Bulk (funciones puras).
// Los filtros viven en la dirección de la página (?coleccion=…&tipo=…) para poder compartir o volver.
import { TYPE_ES, fold, nombreColeccion, rarezaLabel, type Carta, type Catalogo, type IdiomaNombres } from './catalogo';
import type { Donde, Entrada } from './coleccion';
import { ETIQUETA_CONDICION } from './config';

export type Filtros = {
  coleccion: string;     // id de la colección
  tipo: string;          // tipo de energía (Grass, Fire…)
  ilustrador: string;
  rareza: string;
  idioma: string;        // ES, EN, JP…
  acabado: string;       // Normal, Reverse, Holo, Otra
  condicion: string;     // NM, LP, MP, HP, DM
  min: number | null;    // precio mínimo (S/)
  max: number | null;    // precio máximo (S/)
  foto: boolean;         // solo publicaciones con foto real (Mercado)
  reputacion: boolean;   // solo vendedores con buena reputación (Mercado)
  donde: '' | 'album' | 'bulk';   // Mi Colección: dónde está la copia
  venta: '' | 'si' | 'no';        // Mi Colección / Bulk: en venta o no
};

export const FILTROS_VACIOS: Filtros = { coleccion: '', tipo: '', ilustrador: '', rareza: '', idioma: '', acabado: '', condicion: '', min: null, max: null, foto: false, reputacion: false, donde: '', venta: '' };

export type OrdenMercado = 'novedad' | 'precio' | 'valor' | 'ventas' | 'nombre';
export const ORDENES_MERCADO: { id: OrdenMercado; texto: string }[] = [
  { id: 'novedad', texto: 'Más nuevas' }, { id: 'precio', texto: 'Menor precio' }, { id: 'valor', texto: 'Mayor precio' }, { id: 'ventas', texto: 'Más vendidas' }, { id: 'nombre', texto: 'Nombre' }
];
export const esOrdenMercado = (s: string | null | undefined): s is OrdenMercado => ORDENES_MERCADO.some(o => o.id === s);

/** Precio máximo del deslizador (S/); por encima se escribe a mano. */
export const PRECIO_TOPE = 500;

const numero = (s: string | null): number | null => { if (s == null || s === '') return null; const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };

/** Filtros desde la dirección (?coleccion=sv03.5&tipo=Grass&ilustrador=…&rareza=…&idioma=ES&acabado=Holo&estado=NM&min=5&max=50&foto=1&reputacion=1&donde=album&venta=si). `set=` es el nombre antiguo de `coleccion`. */
export function filtrosDeParams(p: URLSearchParams | null | undefined): Filtros {
  if (!p) return { ...FILTROS_VACIOS };
  const g = (k: string) => (p.get(k) || '').trim();
  let min = numero(p.get('min')), max = numero(p.get('max'));
  if (min != null && max != null && min > max) [min, max] = [max, min];
  const donde = g('donde'), venta = g('venta');
  return {
    coleccion: g('coleccion') || g('set'), tipo: g('tipo'), ilustrador: g('ilustrador'), rareza: g('rareza'), idioma: g('idioma'), acabado: g('acabado'), condicion: g('estado') || g('condicion'),
    min, max, foto: g('foto') === '1', reputacion: g('reputacion') === '1',
    donde: donde === 'album' || donde === 'bulk' ? donde : '', venta: venta === 'si' || venta === 'no' ? venta : ''
  };
}

/** Parámetros de la dirección (solo los filtros activos), en un orden fijo; `extra` (q, orden…) va primero. */
export function paramsDeFiltros(f: Filtros, extra: Record<string, string | null | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  if (f.coleccion) p.set('coleccion', f.coleccion);
  if (f.tipo) p.set('tipo', f.tipo);
  if (f.ilustrador) p.set('ilustrador', f.ilustrador);
  if (f.rareza) p.set('rareza', f.rareza);
  if (f.idioma) p.set('idioma', f.idioma);
  if (f.acabado) p.set('acabado', f.acabado);
  if (f.condicion) p.set('estado', f.condicion);
  if (f.min != null) p.set('min', String(f.min));
  if (f.max != null) p.set('max', String(f.max));
  if (f.foto) p.set('foto', '1');
  if (f.reputacion) p.set('reputacion', '1');
  if (f.donde) p.set('donde', f.donde);
  if (f.venta) p.set('venta', f.venta);
  return p;
}

export type ClaveFiltro = keyof Filtros | 'precio';
export type ChipFiltro = { clave: ClaveFiltro; texto: string };

/** Filtros activos como chips quitables ("Colección: 151", "Tipo: Fuego", "S/ 5 – 50"…). */
export function chipsDe(f: Filtros, cat: Pick<Catalogo, 'coleccion'> | null, idioma: IdiomaNombres = 'es'): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  if (f.coleccion) { const s = cat?.coleccion(f.coleccion); chips.push({ clave: 'coleccion', texto: s ? nombreColeccion(s, idioma) : f.coleccion }); }
  if (f.tipo) chips.push({ clave: 'tipo', texto: TYPE_ES[f.tipo] || f.tipo });
  if (f.ilustrador) chips.push({ clave: 'ilustrador', texto: f.ilustrador });
  if (f.rareza) chips.push({ clave: 'rareza', texto: rarezaLabel(f.rareza) });
  if (f.idioma) chips.push({ clave: 'idioma', texto: f.idioma });
  if (f.acabado) chips.push({ clave: 'acabado', texto: f.acabado });
  if (f.condicion) chips.push({ clave: 'condicion', texto: (ETIQUETA_CONDICION[f.condicion] || f.condicion).split(' · ')[0] });
  if (f.min != null || f.max != null) chips.push({ clave: 'precio', texto: f.min != null && f.max != null ? `S/ ${f.min} – ${f.max}` : f.min != null ? `desde S/ ${f.min}` : `hasta S/ ${f.max}` });
  if (f.foto) chips.push({ clave: 'foto', texto: 'Con foto real' });
  if (f.reputacion) chips.push({ clave: 'reputacion', texto: 'Buena reputación' });
  if (f.donde) chips.push({ clave: 'donde', texto: f.donde === 'album' ? 'En álbum' : 'En Bulk' });
  if (f.venta) chips.push({ clave: 'venta', texto: f.venta === 'si' ? 'En venta' : 'No en venta' });
  return chips;
}

export const cuentaFiltros = (f: Filtros): number => chipsDe(f, null).length;

export function quitarFiltro(f: Filtros, clave: ClaveFiltro): Filtros {
  if (clave === 'precio') return { ...f, min: null, max: null };
  return { ...f, [clave]: FILTROS_VACIOS[clave] };
}

/** ¿La carta cumple los filtros del catálogo (colección, tipo, ilustrador, rareza)? Los demás dependen de la copia o la publicación. */
export function cartaCumple(c: Carta, f: Filtros): boolean {
  if (f.coleccion && c.s !== f.coleccion) return false;
  if (f.tipo && !(c.t && c.t.includes(f.tipo))) return false;
  if (f.ilustrador && fold(c.il) !== fold(f.ilustrador)) return false;
  if (f.rareza && (c.r || '') !== f.rareza) return false;
  return true;
}

export const hayFiltrosDeCatalogo = (f: Filtros): boolean => !!(f.coleccion || f.tipo || f.ilustrador || f.rareza);

/** Opciones de ilustrador y rareza del catálogo (con cuántas cartas tiene cada uno), para los selectores. */
export function opcionesCatalogo(cat: Pick<Catalogo, 'cards'>): { ilustradores: { nombre: string; cartas: number }[]; rarezas: { id: string; cartas: number }[] } {
  const il = new Map<string, number>(), ra = new Map<string, number>();
  for (const c of cat.cards) {
    if (c.sd) continue;
    if (c.il) il.set(c.il, (il.get(c.il) || 0) + 1);
    if (c.r) ra.set(c.r, (ra.get(c.r) || 0) + 1);
  }
  return {
    ilustradores: [...il].map(([nombre, cartas]) => ({ nombre, cartas })).sort((a, b) => b.cartas - a.cartas || a.nombre.localeCompare(b.nombre)),
    rarezas: [...ra].map(([id, cartas]) => ({ id, cartas })).sort((a, b) => b.cartas - a.cartas)
  };
}

/** Lo que hace falta para filtrar copias (entradas) de mi colección: precio por defecto, dónde está y si está en venta. */
export type ContextoEntrada = { precio: (c: Carta, acabado: string) => number; donde: (e: Entrada) => Donde | null; enVenta: (e: Entrada) => boolean };

/** ¿La copia cumple los filtros? Catálogo (colección, tipo, ilustrador, rareza), idioma, acabado, estado, precio, dónde y en venta. */
export function entradaCumple(cat: Pick<Catalogo, 'carta'>, e: Entrada, f: Filtros, ctx: ContextoEntrada): boolean {
  const c = cat.carta(e.carta_id);
  if (hayFiltrosDeCatalogo(f) && (!c || !cartaCumple(c, f))) return false;   // las personalizadas no tienen datos de catálogo
  if (f.idioma && (e.idioma || '') !== f.idioma) return false;
  if (f.acabado && (e.acabado || '') !== f.acabado) return false;
  if (f.condicion && (e.condicion || '') !== f.condicion) return false;
  if (f.min != null || f.max != null) {
    if (!c) return false;
    const p = ctx.precio(c, e.acabado);
    if (f.min != null && p < f.min) return false;
    if (f.max != null && p > f.max) return false;
  }
  if (f.donde) { const d = ctx.donde(e); const tipo = d ? (d.tipo === 'caja' ? 'bulk' : 'album') : ''; if (tipo !== f.donde) return false; }
  if (f.venta && (f.venta === 'si') !== ctx.enVenta(e)) return false;
  return true;
}

export type OrdenBulk = 'posicion' | 'nombre' | 'coleccion' | 'precio';
export const ORDENES_BULK: { id: OrdenBulk; texto: string }[] = [
  { id: 'posicion', texto: 'Posición' }, { id: 'nombre', texto: 'Nombre' }, { id: 'coleccion', texto: 'Colección' }, { id: 'precio', texto: 'Precio' }
];
export const esOrdenBulk = (s: string | null | undefined): s is OrdenBulk => ORDENES_BULK.some(o => o.id === s);
