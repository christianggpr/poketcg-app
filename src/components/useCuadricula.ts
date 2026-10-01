'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Ajustes de layout 2 · 4: cuadrícula elegible de la hoja del álbum (columnas × filas) y, en PC, 1 o 2 páginas lado a lado.
// La elección se recuerda por usuario en este dispositivo (y por álbum): 'poketcg:cuadricula:<usuario>:<pc|cel>[:<coleccion>]'.
// Mejoras 4 · B: un álbum personalizado tiene su propia cuadrícula (columnas × filas con las que se creó): se ofrece como
// opción aunque no esté entre las estándar y es la que se usa al entrar si no se eligió otra para ese álbum.

export type Cuadricula = { cols: number; filas: number; paginas: 1 | 2 };
export type OpcionCuadricula = { cols: number; filas: number; id: string };
export type CuadriculaPropia = { cols: number; filas: number } | null | undefined;

const opcion = (cols: number, filas: number): OpcionCuadricula => ({ cols, filas, id: `${cols}x${filas}` });
/** PC: 3×3, 3×4, 4×4, 4×5 y 4×6 (con 2 páginas, solo hasta 4×4 para que entren); celular: 3×3, 3×4 y 4×5. */
export const OPCIONES_PC: OpcionCuadricula[] = [opcion(3, 3), opcion(3, 4), opcion(4, 4), opcion(4, 5), opcion(4, 6)];
export const OPCIONES_PC_DOBLE: OpcionCuadricula[] = OPCIONES_PC.filter(o => o.cols * o.filas <= 16);
export const OPCIONES_CELULAR: OpcionCuadricula[] = [opcion(3, 3), opcion(3, 4), opcion(4, 5)];
export const POR_DEFECTO_PC: Cuadricula = { cols: 4, filas: 5, paginas: 1 };
export const POR_DEFECTO_CELULAR: Cuadricula = { cols: 3, filas: 3, paginas: 1 };

const propiaValida = (propia: CuadriculaPropia): propia is { cols: number; filas: number } => !!propia && Number.isInteger(propia.cols) && Number.isInteger(propia.filas) && propia.cols >= 1 && propia.cols <= 6 && propia.filas >= 1 && propia.filas <= 6;

/** Opciones del modo (PC/celular) y número de páginas; con `propia`, la cuadrícula del álbum personalizado se añade si no está (con 2 páginas, solo hasta 16 casillas). */
export function opcionesDe(esPC: boolean, paginas: 1 | 2, propia?: CuadriculaPropia): OpcionCuadricula[] {
  const base = esPC ? (paginas === 2 ? OPCIONES_PC_DOBLE : OPCIONES_PC) : OPCIONES_CELULAR;
  if (!propiaValida(propia) || base.some(o => o.cols === propia.cols && o.filas === propia.filas) || (esPC && paginas === 2 && propia.cols * propia.filas > 16)) return base;
  return [...base, opcion(propia.cols, propia.filas)].sort((a, b) => a.cols * a.filas - b.cols * b.filas || a.cols - b.cols);
}

/** Deja la cuadrícula dentro de las opciones válidas del modo (PC/celular) y del número de páginas. */
export function normalizar(c: Partial<Cuadricula> | null | undefined, esPC: boolean, propia?: CuadriculaPropia): Cuadricula {
  const base = esPC ? POR_DEFECTO_PC : POR_DEFECTO_CELULAR;
  const paginas: 1 | 2 = esPC && c?.paginas === 2 ? 2 : 1;
  const ops = opcionesDe(esPC, paginas, propia);
  const cols = Number(c?.cols), filas = Number(c?.filas);
  const valida = ops.find(o => o.cols === cols && o.filas === filas);
  if (valida) return { cols, filas, paginas };
  // con 2 páginas, una cuadrícula más grande que 4×4 baja a 4×4
  if (paginas === 2 && cols * filas > 16) return { cols: 4, filas: 4, paginas };
  // un álbum personalizado arranca con su propia cuadrícula
  if (propiaValida(propia) && (paginas === 1 || propia.cols * propia.filas <= 16)) return { cols: propia.cols, filas: propia.filas, paginas };
  return { ...base, paginas: esPC ? paginas : 1 };
}

const clave = (usuarioId: string | null | undefined, esPC: boolean, setId?: string) => `poketcg:cuadricula:${usuarioId || 'anon'}:${esPC ? 'pc' : 'cel'}${setId ? `:${setId}` : ''}`;

/** Cuadrícula guardada: la de este álbum si la eligió; si no, la propia del álbum personalizado; si no, la última elección general. */
export function cuadriculaGuardada(usuarioId: string | null | undefined, esPC: boolean, setId?: string, propia?: CuadriculaPropia): Cuadricula {
  try {
    const deEste = setId ? localStorage.getItem(clave(usuarioId, esPC, setId)) : null;
    if (deEste) return normalizar(JSON.parse(deEste), esPC, propia);
    if (propiaValida(propia)) return normalizar({ ...propia, paginas: 1 }, esPC, propia);
    const general = localStorage.getItem(clave(usuarioId, esPC));
    return normalizar(general ? JSON.parse(general) : null, esPC, propia);
  } catch { return normalizar(propiaValida(propia) ? { ...propia, paginas: 1 } : null, esPC, propia); }
}

export function guardarCuadricula(c: Cuadricula, usuarioId: string | null | undefined, esPC: boolean, setId?: string) {
  try {
    const txt = JSON.stringify(c);
    localStorage.setItem(clave(usuarioId, esPC), txt);           // la última elección vale para los demás álbumes
    if (setId) localStorage.setItem(clave(usuarioId, esPC, setId), txt);   // y se recuerda para este álbum
  } catch { /* sin almacenamiento */ }
}

/** Cuadrícula del álbum: se lee al entrar (por usuario y álbum) y se guarda al cambiarla. `propia`: la del álbum personalizado. */
export function useCuadricula(usuarioId: string | null | undefined, setId: string | undefined, esPC: boolean, propia?: CuadriculaPropia) {
  const cols = propiaValida(propia) ? propia.cols : 0, filas = propiaValida(propia) ? propia.filas : 0;
  const [cuad, setCuadEstado] = useState<Cuadricula>(() => normalizar(cols ? { cols, filas, paginas: 1 } : null, esPC, cols ? { cols, filas } : null));
  const actual = useRef(cuad);
  actual.current = cuad;
  useEffect(() => { setCuadEstado(cuadriculaGuardada(usuarioId, esPC, setId, cols ? { cols, filas } : null)); }, [usuarioId, esPC, setId, cols, filas]);
  const setCuad = useCallback((cambio: Partial<Cuadricula>) => {
    const nueva = normalizar({ ...actual.current, ...cambio }, esPC, cols ? { cols, filas } : null);
    guardarCuadricula(nueva, usuarioId, esPC, setId);
    setCuadEstado(nueva);
  }, [usuarioId, esPC, setId, cols, filas]);
  return { cuad, setCuad, opciones: opcionesDe(esPC, cuad.paginas, cols ? { cols, filas } : null) };
}
