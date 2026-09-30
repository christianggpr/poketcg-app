// Tipos de la colección del usuario y lógica de ubicación física (cajas y posiciones).
import { Catalogo, type Carta, type Coleccion, type IdiomaNombres, cmpKeys, fold, nombreCarta, nombreColeccion, numKey } from './catalogo';

export type Caja = {
  id: string;
  usuario_id: string;
  nombre: string;
  descripcion: string;
  orden: number;
  modo: 'auto' | 'manual';
  orden_colecciones: 'asc' | 'desc';
  creado_en: string;
  actualizado_en: string;
};

export type Personalizada = { nombre?: string; coleccion?: string; numero?: string };

export type Entrada = {
  id: string;
  usuario_id: string;
  carta_id: string | null;
  personalizada: Personalizada | null;
  caja_id: string | null;
  cantidad: number;
  acabado: string;
  idioma: string;
  condicion: string;
  nota: string;
  posicion: number | null;
  creado_en: string;
  actualizado_en: string;
};

export type Album = {
  id: string;
  usuario_id: string;
  nombre: string;
  descripcion: string;
  paginas: number;
  columnas: number;
  filas: number;
  creado_en: string;
  actualizado_en: string;
};

export type Casilla = { album_id: string; indice: number; carta_id: string | null; entrada_id: string | null };

export type Perfil = {
  id: string;
  username: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  dni: string | null;
  rol: 'usuario' | 'admin';
  acepto_terminos_en: string | null;
  idioma_nombres: IdiomaNombres;
  creado_en: string;
  actualizado_en: string;
};

export const ts = (s: string | null | undefined): number => (s ? Date.parse(s) || 0 : 0);

export function cajasOrdenadas(cajas: Caja[]): Caja[] {
  return cajas.slice().sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre) || ts(a.creado_en) - ts(b.creado_en));
}

export function nombreEntrada(cat: Catalogo, e: Entrada, idioma: IdiomaNombres): string {
  const c = cat.carta(e.carta_id);
  return c ? nombreCarta(c, idioma) : e.personalizada?.nombre || 'Carta';
}
export function numeroEntrada(cat: Catalogo, e: Entrada): string {
  const c = cat.carta(e.carta_id);
  return c ? c.l : e.personalizada?.numero || '';
}
export function coleccionEntrada(cat: Catalogo, e: Entrada, idioma: IdiomaNombres): string {
  const c = cat.carta(e.carta_id);
  return c ? nombreColeccion(cat.setOf(c), idioma) : e.personalizada?.coleccion || 'Otras';
}
export function claveColeccionEntrada(cat: Catalogo, e: Entrada): string {
  const c = cat.carta(e.carta_id);
  return c ? c.s : 'custom:' + fold(e.personalizada?.coleccion || '');
}

const invDate = (d: string): string => String(d || '').replace(/\d/g, ch => String(9 - Number(ch)));

/** Clave de orden físico dentro de una caja (izquierda → derecha). */
export function claveOrdenEntrada(cat: Catalogo, e: Entrada, caja: Caja): unknown[] {
  if (caja.modo === 'manual') return [e.posicion || 0, ts(e.creado_en)];
  const c = cat.carta(e.carta_id);
  if (c) {
    const s = cat.setOf(c);
    const d = s ? s.d : '9999';
    const dateKey = caja.orden_colecciones === 'desc' ? invDate(d) : d;
    return [0, dateKey, s ? s.id : '', ...numKey(c.l), fold(c.n)];
  }
  const p = e.personalizada || {};
  return [1, fold(p.coleccion || ''), '', ...numKey(p.numero || ''), fold(p.nombre || '')];
}

export type PosicionEntrada = { entrada: Entrada; idx: number; seccion: string; claveSeccion: string };
export type PosicionesCaja = { lista: PosicionEntrada[]; porId: Map<string, PosicionEntrada>; total: number };

export function posicionesCaja(cat: Catalogo, caja: Caja, entradas: Entrada[], idioma: IdiomaNombres): PosicionesCaja {
  const list = entradas.filter(e => e.caja_id === caja.id).map(e => ({ e, k: claveOrdenEntrada(cat, e, caja) }));
  list.sort((a, b) => cmpKeys(a.k, b.k) || ts(a.e.creado_en) - ts(b.e.creado_en) || a.e.id.localeCompare(b.e.id));
  const lista = list.map((it, i) => ({ entrada: it.e, idx: i + 1, seccion: coleccionEntrada(cat, it.e, idioma), claveSeccion: claveColeccionEntrada(cat, it.e) }));
  return { lista, porId: new Map(lista.map(o => [o.entrada.id, o])), total: lista.length };
}

export type Ubicacion = {
  caja: Caja;
  idx: number;
  total: number;
  seccion: string;
  anterior: Entrada | null;
  siguiente: Entrada | null;
  ordinalCaja: number;
};

/** Calcula las posiciones de todas las cajas una sola vez (para listas grandes). */
export class Ubicador {
  private cache = new Map<string, PosicionesCaja>();
  private ordenadas: Caja[];
  private cat: Catalogo;
  private cajas: Caja[];
  private entradas: Entrada[];
  private idioma: IdiomaNombres;
  constructor(cat: Catalogo, cajas: Caja[], entradas: Entrada[], idioma: IdiomaNombres) {
    this.cat = cat; this.cajas = cajas; this.entradas = entradas; this.idioma = idioma;
    this.ordenadas = cajasOrdenadas(cajas);
  }
  caja(id: string | null): Caja | undefined { return id ? this.cajas.find(b => b.id === id) : undefined; }
  posiciones(caja: Caja): PosicionesCaja {
    let p = this.cache.get(caja.id);
    if (!p) { p = posicionesCaja(this.cat, caja, this.entradas, this.idioma); this.cache.set(caja.id, p); }
    return p;
  }
  ordinal(caja: Caja): number { return this.ordenadas.findIndex(b => b.id === caja.id) + 1; }
  ubicacion(e: Entrada): Ubicacion | null {
    const caja = this.caja(e.caja_id);
    if (!caja) return null;
    const pos = this.posiciones(caja);
    const me = pos.porId.get(e.id);
    if (!me) return null;
    const prev = pos.lista[me.idx - 2] || null, next = pos.lista[me.idx] || null;
    return { caja, idx: me.idx, total: pos.total, seccion: me.seccion, anterior: prev && prev.entrada, siguiente: next && next.entrada, ordinalCaja: this.ordinal(caja) };
  }
}

export const totalCartas = (entradas: Entrada[]): number => entradas.reduce((n, e) => n + (e.cantidad || 1), 0);

/** Agrupa las entradas por colección (para "Mi colección"). */
export function agruparPorColeccion(cat: Catalogo, entradas: Entrada[], idioma: IdiomaNombres): { key: string; set: Coleccion | undefined; nombre: string; entradas: Entrada[]; cartas: Carta[] }[] {
  const grupos = new Map<string, { key: string; set: Coleccion | undefined; nombre: string; entradas: Entrada[]; cartas: Carta[] }>();
  for (const e of entradas) {
    const key = claveColeccionEntrada(cat, e);
    let g = grupos.get(key);
    if (!g) {
      const c = cat.carta(e.carta_id);
      g = { key, set: c ? cat.setOf(c) : undefined, nombre: coleccionEntrada(cat, e, idioma), entradas: [], cartas: [] };
      grupos.set(key, g);
    }
    g.entradas.push(e);
    const c = cat.carta(e.carta_id);
    if (c && !g.cartas.includes(c)) g.cartas.push(c);
  }
  return [...grupos.values()].sort((a, b) => (a.set ? 0 : 1) - (b.set ? 0 : 1) || (b.set?.d || '').localeCompare(a.set?.d || '') || a.nombre.localeCompare(b.nombre));
}
