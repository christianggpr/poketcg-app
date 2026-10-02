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
  en_venta: boolean;          // Fase 2: las cartas de la caja se publican solas en el mercado
  preguntar_venta: boolean;   // Fase 2: ¿preguntar al añadir cartas si se suben al mercado?
  creado_en: string;
  actualizado_en: string;
};

export type EstadoPublicacion = 'activa' | 'pausada' | 'reservada' | 'vendida' | 'retirada';
export type Publicacion = {
  id: string;
  usuario_id: string;
  entrada_id: string | null;
  carta_id: string | null;
  cantidad: number;
  tipo_precio: 'defecto' | 'manual';
  precio_pen: number;
  precio_mercado_pen: number | null;
  fotos: string[];
  estado: EstadoPublicacion;
  motivo_pausa: string | null;
  aviso: string | null;
  acabado: string;
  idioma: string;
  condicion: string;
  creada: string;
  actualizada: string;
};
export const PUBLICACION_VIVA = new Set<EstadoPublicacion>(['activa', 'pausada', 'reservada']);

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
  compra_orden_id?: string | null;   // Fase 3: entrada creada por una compra en el mercado (llega "por colocar")
  album_coleccion?: string | null;   // Mejoras 1: guardada en el álbum por colección de esa colección (casilla = su número)
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
  /** Mejoras 3 · A: color de la portada (#RRGGBB) y marca de agua (emblema | llamas | olas | hojas | rayos | estrellas | ninguna). Faltan si la base aún no tiene 0008. */
  color?: string | null;
  marca_agua?: string | null;
  /** Mejoras 5 · B: tipo de álbum (coleccion | pokemon | tipo | ilustrador | libre) y sus parámetros. Faltan si la base aún no tiene 0011. */
  tipo_album?: string | null;
  parametros?: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

export type Casilla = { album_id: string; indice: number; carta_id: string | null; entrada_id: string | null };

/** Reputación cacheada de un vendedor (la calcula la base: actualizar_reputacion). */
export type Reputacion = { ventas?: number; resenas?: number; puntaje?: number | null; faltas_90?: number; faltas?: number; confirma_horas?: number | null; cumple_pct?: number | null; insignias?: string[]; alerta?: string | null; actualizada?: string };

export type Perfil = {
  id: string;
  username: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  dni: string | null;
  rol: 'usuario' | 'admin' | 'tienda';
  tienda_id?: string | null;
  celular_verificado_en?: string | null;
  estado?: 'activo' | 'suspendido';
  suspendido_motivo?: string | null;
  reputacion?: Reputacion | null;
  acepto_terminos_en: string | null;
  idioma_nombres: IdiomaNombres;
  /** Mejoras 3 · B: fondo de la app (liso | llamas | olas | hojas | rayos | estrellas | aleatorio) e intensidad 0–100. Faltan si la base aún no tiene 0008. */
  fondo?: string | null;
  fondo_intensidad?: number | null;
  /** Mejoras 4 · C: la Pokédex oculta en la lista de álbumes. Falta si la base aún no tiene 0009. */
  pokedex_oculto?: boolean | null;
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
  tipo: 'caja';
  caja: Caja;
  idx: number;
  total: number;
  seccion: string;
  anterior: Entrada | null;
  siguiente: Entrada | null;
  ordinalCaja: number;
};
/** Mejoras 1: la carta está en un álbum por colección (casilla = su número impreso). */
export type UbicacionColeccion = { tipo: 'coleccion'; set: Coleccion | undefined; setId: string; idioma: string; numero: string };
/** Mejoras 1: la carta está en el bolsillo de un álbum personalizado. */
export type UbicacionAlbum = { tipo: 'album'; album: Album; indice: number; pagina: number; bolsillo: number; porPagina: number };
export type Donde = Ubicacion | UbicacionColeccion | UbicacionAlbum;

/** Texto corto de una ubicación ("Bulk 2 #37", "Álbum PRE EN · 123/131", "Álbum «Charmander» pág. 2 bolsillo 5"). */
export function textoDonde(d: Donde | null, idioma: IdiomaNombres = 'es'): string {
  if (!d) return 'Sin ubicación';
  if (d.tipo === 'caja') return `${d.caja.nombre} #${d.idx}`;
  if (d.tipo === 'coleccion') return `Álbum ${nombreColeccion(d.set, idioma, true)} ${d.idioma} · ${d.numero}`;
  return `Álbum «${d.album.nombre}» pág. ${d.pagina} bolsillo ${d.bolsillo}`;
}

/** Calcula las posiciones de todas las cajas una sola vez (para listas grandes). */
export class Ubicador {
  private cache = new Map<string, PosicionesCaja>();
  private ordenadas: Caja[];
  private cat: Catalogo;
  private cajas: Caja[];
  private entradas: Entrada[];
  private idioma: IdiomaNombres;
  private albumes: Album[];
  private casillaPorEntrada: Map<string, Casilla>;
  constructor(cat: Catalogo, cajas: Caja[], entradas: Entrada[], idioma: IdiomaNombres, albumes: Album[] = [], casillas: Casilla[] = []) {
    this.cat = cat; this.cajas = cajas; this.entradas = entradas; this.idioma = idioma; this.albumes = albumes;
    this.ordenadas = cajasOrdenadas(cajas);
    this.casillaPorEntrada = new Map(casillas.filter(c => c.entrada_id).map(c => [c.entrada_id as string, c]));
  }
  caja(id: string | null): Caja | undefined { return id ? this.cajas.find(b => b.id === id) : undefined; }
  posiciones(caja: Caja): PosicionesCaja {
    let p = this.cache.get(caja.id);
    if (!p) { p = posicionesCaja(this.cat, caja, this.entradas, this.idioma); this.cache.set(caja.id, p); }
    return p;
  }
  ordinal(caja: Caja): number { return this.ordenadas.findIndex(b => b.id === caja.id) + 1; }
  /** Ubicación en un Bulk (null si la carta no está en ninguno). */
  ubicacion(e: Entrada): Ubicacion | null {
    const caja = this.caja(e.caja_id);
    if (!caja) return null;
    const pos = this.posiciones(caja);
    const me = pos.porId.get(e.id);
    if (!me) return null;
    const prev = pos.lista[me.idx - 2] || null, next = pos.lista[me.idx] || null;
    return { tipo: 'caja', caja, idx: me.idx, total: pos.total, seccion: me.seccion, anterior: prev && prev.entrada, siguiente: next && next.entrada, ordinalCaja: this.ordinal(caja) };
  }
  /** Ubicación completa: Bulk, álbum por colección o bolsillo de un álbum personalizado. */
  donde(e: Entrada): Donde | null {
    const enCaja = this.ubicacion(e);
    if (enCaja) return enCaja;
    if (e.album_coleccion) {
      const c = this.cat.carta(e.carta_id);
      return { tipo: 'coleccion', set: this.cat.coleccion(e.album_coleccion), setId: e.album_coleccion, idioma: e.idioma || (this.cat.coleccion(e.album_coleccion)?.rg === 'ja' ? 'JP' : 'EN'), numero: c ? c.l : e.personalizada?.numero || '' };
    }
    const cas = this.casillaPorEntrada.get(e.id);
    if (cas) {
      const album = this.albumes.find(a => a.id === cas.album_id);
      if (album) { const porPagina = Math.max(1, album.columnas * album.filas); return { tipo: 'album', album, indice: cas.indice, pagina: Math.floor(cas.indice / porPagina) + 1, bolsillo: (cas.indice % porPagina) + 1, porPagina }; }
    }
    return null;
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
