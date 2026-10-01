// Mejoras 1 · C3: sugerencia de dónde guardar una carta mirando cómo colecciona el usuario.
//   1. álbum por colección de esa misma colección y en ese idioma → casilla de su número
//   2. álbum personalizado cuyas cartas son mayormente del mismo Pokémon (o del mismo ilustrador, rareza o tipo)
//   3. álbum por colección de la misma colección en otro idioma (se avisa)
//   4. Bulk: el que ya guarda cartas de esa colección (o el último usado), con la posición que le tocaría
// Es solo una sugerencia: el usuario decide. Funciones puras (se prueban en test/logica.test.ts).
import type { Album, Caja, Casilla, Entrada } from './coleccion';
import { cajasOrdenadas, claveOrdenEntrada, ts } from './coleccion';
import { cmpKeys } from './catalogo';
import type { Carta, Catalogo, IdiomaNombres } from './catalogo';
import { nombreCarta, nombreColeccion } from './catalogo';

export type Sugerencia =
  | { tipo: 'coleccion'; set: string; idioma: string; motivo: string; aviso?: string; etiqueta: string }
  | { tipo: 'album'; album: Album; indice: number; motivo: string; etiqueta: string }
  | { tipo: 'bulk'; caja: Caja; posicion: number; total: number; motivo: string; etiqueta: string }
  | null;

export type ContextoSugerencia = {
  cat: Catalogo;
  entradas: Entrada[];
  cajas: Caja[];
  albumes: Album[];
  casillas: Casilla[];
  idiomaNombres: IdiomaNombres;
  ultimaCajaId?: string | null;
};

/** Normaliza el idioma de una entrada ('' se trata como el idioma por defecto de la colección: JP para japonesas, EN para el resto). */
export function idiomaEfectivo(cat: Catalogo, e: { idioma: string; carta_id: string | null }): string {
  if (e.idioma) return e.idioma;
  const c = cat.carta(e.carta_id);
  const s = c ? cat.setOf(c) : undefined;
  return s?.rg === 'ja' ? 'JP' : 'EN';
}

/** Álbumes por colección que el usuario "tiene": colección + idioma con al menos una carta (y cuántas van en el álbum). */
export function albumesPorColeccion(cat: Catalogo, entradas: Entrada[]): Map<string, { set: string; idioma: string; cartas: number; enAlbum: number }> {
  const m = new Map<string, { set: string; idioma: string; cartas: number; enAlbum: number }>();
  for (const e of entradas) {
    const c = cat.carta(e.carta_id);
    if (!c) continue;
    const idioma = idiomaEfectivo(cat, e);
    const k = `${c.s}|${idioma}`;
    const v = m.get(k) || { set: c.s, idioma, cartas: 0, enAlbum: 0 };
    v.cartas += e.cantidad || 1;
    if (e.album_coleccion === c.s) v.enAlbum += e.cantidad || 1;
    m.set(k, v);
  }
  return m;
}

type Patron = { clase: 'pokemon' | 'ilustrador' | 'rareza' | 'tipo'; valor: string; cuantas: number; total: number };

/** Patrón dominante de un álbum personalizado (≥ 60 % de sus cartas comparten Pokémon/línea, ilustrador, rareza o tipo). */
export function patronAlbum(cat: Catalogo, cartas: Carta[]): Patron | null {
  if (cartas.length < 3) return null;
  const total = cartas.length;
  const contar = (f: (c: Carta) => string[]) => {
    const m = new Map<string, number>();
    for (const c of cartas) for (const v of new Set(f(c))) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  };
  // Pokémon: cuentan todas las especies que aparecen (una línea evolutiva suma Charmander + Charmeleon + Charizard)
  const especies = contar(c => (c.dex || []).map(String));
  if (especies) {
    const porLinea = cartas.filter(c => (c.dex || []).length).length;
    if (porLinea / total >= 0.6) {
      const m = new Map<number, number>();
      for (const c of cartas) for (const d of new Set(c.dex || [])) m.set(d, (m.get(d) || 0) + 1);
      // especies "del álbum": las que aparecen en al menos el 15 % de las cartas (así entra la línea completa:
      // Charmander + Charmeleon + Charizard) y pocas distintas (un álbum temático repite Pokémon)
      const lineas = [...m.entries()].filter(([, n]) => n / total >= 0.15).map(([d]) => d).sort((a, b) => a - b);
      const enLinea = cartas.filter(c => (c.dex || []).some(d => lineas.includes(d))).length;
      if (lineas.length && lineas.length <= Math.max(3, total / 2) && enLinea / total >= 0.6) return { clase: 'pokemon', valor: lineas.join(','), cuantas: enLinea, total };
    }
  }
  const il = contar(c => [c.il || '']);
  if (il && il[1] / total >= 0.6) return { clase: 'ilustrador', valor: il[0], cuantas: il[1], total };
  const r = contar(c => [c.r || '']);
  if (r && r[1] / total >= 0.8 && !/^(Common|Uncommon|Rare)$/.test(r[0])) return { clase: 'rareza', valor: r[0], cuantas: r[1], total };
  const t = contar(c => c.t || []);
  if (t && t[1] / total >= 0.8) return { clase: 'tipo', valor: t[0], cuantas: t[1], total };
  return null;
}

const cumple = (p: Patron, c: Carta): boolean =>
  p.clase === 'pokemon' ? (c.dex || []).some(d => p.valor.split(',').includes(String(d)))
  : p.clase === 'ilustrador' ? (c.il || '') === p.valor
  : p.clase === 'rareza' ? (c.r || '') === p.valor
  : (c.t || []).includes(p.valor);

const nombreEspecies = (cat: Catalogo, valor: string, idioma: IdiomaNombres): string => {
  const nombres = valor.split(',').map(d => cat.especie(Number(d))).filter((x): x is NonNullable<typeof x> => !!x).map(e => (idioma === 'ja' ? e[3] : idioma === 'en' ? e[1] : e[2]) || e[1]);
  return nombres.length > 3 ? nombres.slice(0, 3).join(', ') + '…' : nombres.join(', ');
};

/** Posición que tendría una carta nueva dentro de un Bulk (sin guardarla todavía). */
export function posicionVirtual(cat: Catalogo, caja: Caja, entradas: Entrada[], nueva: Entrada): { posicion: number; total: number } {
  const lista = [...entradas.filter(e => e.caja_id === caja.id), nueva].map(e => ({ e, k: claveOrdenEntrada(cat, e, caja) }));
  lista.sort((a, b) => cmpKeys(a.k, b.k) || ts(a.e.creado_en) - ts(b.e.creado_en) || a.e.id.localeCompare(b.e.id));
  return { posicion: lista.findIndex(x => x.e.id === nueva.id) + 1, total: lista.length };
}

/** Sugiere dónde guardar `carta` (con el idioma dado) según los álbumes, bolsillos y Bulks del usuario. */
export function sugerirDestino(ctx: ContextoSugerencia, carta: Carta, idioma: string, excluirEntradaId?: string | null): Sugerencia {
  const { cat, cajas, albumes, casillas } = ctx;
  // solo cuentan las cartas que ya tienen lugar (Bulk, álbum o bolsillo): las recién recibidas no dicen cómo coleccionas
  const enBolsillo = new Set(casillas.filter(c => c.entrada_id).map(c => c.entrada_id as string));
  const entradas = ctx.entradas.filter(e => e.id !== excluirEntradaId && (e.caja_id || e.album_coleccion || enBolsillo.has(e.id)));
  const set = cat.setOf(carta);
  const nombreSet = nombreColeccion(set, ctx.idiomaNombres, true);
  const idiomaCarta = idioma || (set?.rg === 'ja' ? 'JP' : 'EN');
  const porColeccion = albumesPorColeccion(cat, entradas);
  const idiomaTxt: Record<string, string> = { ES: 'español', EN: 'inglés', JP: 'japonés', PT: 'portugués', FR: 'francés', DE: 'alemán', IT: 'italiano' };

  // 1. álbum de la misma colección y en ese idioma
  const mismo = porColeccion.get(`${carta.s}|${idiomaCarta}`);
  if (mismo) {
    return { tipo: 'coleccion', set: carta.s, idioma: idiomaCarta, etiqueta: `Álbum ${nombreSet} ${idiomaCarta}`, motivo: `Porque coleccionas ${nombreSet} en ${idiomaTxt[idiomaCarta] || idiomaCarta} (${mismo.cartas} ${mismo.cartas === 1 ? 'carta' : 'cartas'}${mismo.enAlbum ? `, ${mismo.enAlbum} en el álbum` : ''}): va en la casilla ${carta.l}.` };
  }

  // 2. álbum personalizado con un patrón claro que la carta cumple
  const porAlbum = new Map<string, Casilla[]>();
  for (const c of casillas) porAlbum.set(c.album_id, [...(porAlbum.get(c.album_id) || []), c]);
  let mejor: { album: Album; indice: number; patron: Patron } | null = null;
  for (const album of albumes) {
    const cas = porAlbum.get(album.id) || [];
    const cartasAlbum = cas.map(c => cat.carta(c.carta_id)).filter((c): c is Carta => !!c);
    const patron = patronAlbum(cat, cartasAlbum);
    if (!patron || !cumple(patron, carta)) continue;
    const capacidad = album.paginas * album.columnas * album.filas;
    const propia = cas.find(c => c.carta_id === carta.id && !c.entrada_id);
    let indice = propia ? propia.indice : -1;
    if (indice < 0) { const ocupados = new Set(cas.filter(c => c.carta_id || c.entrada_id).map(c => c.indice)); for (let i = 0; i < capacidad; i++) if (!ocupados.has(i)) { indice = i; break; } }
    if (indice < 0) continue;
    if (!mejor || patron.cuantas > mejor.patron.cuantas) mejor = { album, indice, patron };
  }
  if (mejor) {
    const p = mejor.patron;
    const porQue = p.clase === 'pokemon' ? `tiene ${p.cuantas} cartas de ${nombreEspecies(cat, p.valor, ctx.idiomaNombres)}` : p.clase === 'ilustrador' ? `tiene ${p.cuantas} cartas ilustradas por ${p.valor}` : p.clase === 'rareza' ? `casi todas sus cartas son ${p.valor}` : `casi todas sus cartas son de tipo ${p.valor}`;
    return { tipo: 'album', album: mejor.album, indice: mejor.indice, etiqueta: `Álbum «${mejor.album.nombre}»`, motivo: `Porque tu álbum «${mejor.album.nombre}» ${porQue}: va en el bolsillo ${mejor.indice + 1}.` };
  }

  // 3. la misma colección en otro idioma
  const otro = [...porColeccion.values()].filter(v => v.set === carta.s).sort((a, b) => b.cartas - a.cartas)[0];
  if (otro) {
    return { tipo: 'coleccion', set: carta.s, idioma: otro.idioma, etiqueta: `Álbum ${nombreSet} ${otro.idioma}`, aviso: `Ese álbum está en ${idiomaTxt[otro.idioma] || otro.idioma} y esta carta es en ${idiomaTxt[idiomaCarta] || idiomaCarta}.`, motivo: `Porque coleccionas ${nombreSet} en ${idiomaTxt[otro.idioma] || otro.idioma} (${otro.cartas} ${otro.cartas === 1 ? 'carta' : 'cartas'}), aunque el idioma no coincide.` };
  }

  // 4. Bulk: el que ya guarda cartas de esa colección; si no, el último usado o el primero
  const ordenadas = cajasOrdenadas(cajas);
  if (!ordenadas.length) return null;
  const porCaja = new Map<string, number>();
  for (const e of entradas) { const c = cat.carta(e.carta_id); if (c && c.s === carta.s && e.caja_id) porCaja.set(e.caja_id, (porCaja.get(e.caja_id) || 0) + (e.cantidad || 1)); }
  const conSet = [...porCaja.entries()].sort((a, b) => b[1] - a[1])[0];
  const caja = (conSet && ordenadas.find(c => c.id === conSet[0])) || ordenadas.find(c => c.id === ctx.ultimaCajaId) || ordenadas[0];
  const nueva: Entrada = { id: '__nueva__', usuario_id: '', carta_id: carta.id, personalizada: null, caja_id: caja.id, cantidad: 1, acabado: '', idioma: idiomaCarta, condicion: '', nota: '', posicion: null, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
  const { posicion, total } = posicionVirtual(cat, caja, entradas, nueva);
  const motivo = conSet ? `Porque no tienes un álbum de ${nombreSet} y tu ${caja.nombre} ya guarda ${conSet[1]} ${conSet[1] === 1 ? 'carta' : 'cartas'} de esa colección: iría en la posición #${posicion} de ${total}.` : `Porque no tienes un álbum de ${nombreSet}: iría a ${caja.nombre}, posición #${posicion} de ${total}.`;
  return { tipo: 'bulk', caja, posicion, total, etiqueta: caja.nombre, motivo };
}

/** Nombre corto de una carta para los textos de la sugerencia. */
export const etiquetaCarta = (cat: Catalogo, carta: Carta, idioma: IdiomaNombres): string => `${nombreCarta(carta, idioma)} ${carta.l}`;
