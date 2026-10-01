// Mejoras 2 · C: poner en venta un álbum eligiendo con qué me quedo.
//   1. Quedarme con 1 de cada carta (solo se venden las repetidas)      ┐ combinables
//   2. Quedarme con las de mayor precio (más de S/ X, o las N más caras) ┘
//   3. Elegir una por una (la lista viene marcada según 1 y 2; se desmarca lo que no se vende)
//   4. Vender todo
// Funciones puras (se prueban en test/venta-album.test.ts).
import type { Entrada } from './coleccion';
import { ts } from './coleccion';

export type ReglasVenta = {
  modo: 'reglas' | 'todo';
  unaDeCada: boolean;
  mayorPrecio: { activo: boolean; tipo: 'limite' | 'topN'; limite: number; n: number };
  /** Cartas (ids) desmarcadas a mano en "Elegir una por una": se quedan completas. */
  excluidas: Set<string>;
};

export const REGLAS_POR_DEFECTO: ReglasVenta = { modo: 'reglas', unaDeCada: true, mayorPrecio: { activo: false, tipo: 'limite', limite: 50, n: 5 }, excluidas: new Set() };

export type LineaVenta = {
  entrada: Entrada;
  cartaId: string;
  /** Precio por defecto de una copia (S/). */
  precio: number;
  /** Copias que se publican de esta entrada. */
  publicar: number;
  /** Copias que se quedan. */
  quedan: number;
  /** Por qué se queda (todo o parte): 'una' = 1 de cada, 'precio' = mayor precio, 'mano' = desmarcada. */
  motivo?: 'una' | 'precio' | 'mano';
};

export type ResumenVenta = { lineas: LineaVenta[]; publican: number; quedan: number; cartasPublicadas: number; cartasQuedan: number; total: number; conFoto: number; cartasCaras: Set<string> };

/**
 * Reparte las copias de cada carta (álbum + Bulk de esa colección e idioma) entre "se publican" y "se quedan" según las
 * reglas. `precioDe(entrada)` = precio por defecto de una copia. Las cartas más caras se deciden por carta, no por copia.
 */
export function repartirVenta(entradas: Entrada[], precioDe: (e: Entrada) => number, reglas: ReglasVenta): ResumenVenta {
  const porCarta = new Map<string, Entrada[]>();
  for (const e of entradas) { if (!e.carta_id) continue; porCarta.set(e.carta_id, [...(porCarta.get(e.carta_id) || []), e]); }
  // cartas que se quedan completas por precio
  const cartasCaras = new Set<string>();
  if (reglas.modo === 'reglas' && reglas.mayorPrecio.activo) {
    const precios = [...porCarta.entries()].map(([id, es]) => [id, Math.max(...es.map(precioDe))] as const);
    if (reglas.mayorPrecio.tipo === 'limite') { for (const [id, p] of precios) if (p > reglas.mayorPrecio.limite) cartasCaras.add(id); }
    else { precios.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); for (const [id] of precios.slice(0, Math.max(0, reglas.mayorPrecio.n))) cartasCaras.add(id); }
  }
  const lineas: LineaVenta[] = [];
  for (const [cartaId, es] of porCarta) {
    // la copia que se queda es la de la casilla del álbum (si la hay); si no, la entrada más antigua
    const orden = es.slice().sort((a, b) => Number(!!b.album_coleccion) - Number(!!a.album_coleccion) || ts(a.creado_en) - ts(b.creado_en) || a.id.localeCompare(b.id));
    const quedaEntera = reglas.modo === 'reglas' && (reglas.excluidas.has(cartaId) || cartasCaras.has(cartaId));
    const motivoEntera: LineaVenta['motivo'] = reglas.excluidas.has(cartaId) ? 'mano' : 'precio';
    let guardar = reglas.modo === 'reglas' && reglas.unaDeCada ? 1 : 0;   // la copia de la casilla
    for (const e of orden) {
      const precio = precioDe(e);
      if (quedaEntera) { lineas.push({ entrada: e, cartaId, precio, publicar: 0, quedan: e.cantidad, motivo: motivoEntera }); continue; }
      const seQueda = Math.min(guardar, e.cantidad);
      guardar -= seQueda;
      lineas.push({ entrada: e, cartaId, precio, publicar: e.cantidad - seQueda, quedan: seQueda, motivo: seQueda ? 'una' : undefined });
    }
  }
  const publican = lineas.reduce((n, l) => n + l.publicar, 0);
  const quedan = lineas.reduce((n, l) => n + l.quedan, 0);
  const total = Math.round(lineas.reduce((n, l) => n + l.publicar * l.precio, 0) * 100) / 100;
  const conFoto = lineas.filter(l => l.publicar > 0 && l.precio > 50).length;
  const cartasPublicadas = new Set(lineas.filter(l => l.publicar > 0).map(l => l.cartaId)).size;
  const cartasQuedan = new Set(lineas.filter(l => l.quedan > 0).map(l => l.cartaId)).size;
  return { lineas, publican, quedan, cartasPublicadas, cartasQuedan, total, conFoto, cartasCaras };
}
