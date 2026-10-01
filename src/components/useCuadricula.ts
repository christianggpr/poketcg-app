'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Ajustes de layout 2 · 4: cuadrícula elegible de la hoja del álbum (columnas × filas) y, en PC, 1 o 2 páginas lado a lado.
// La elección se recuerda por usuario en este dispositivo (y por álbum): 'poketcg:cuadricula:<usuario>:<pc|cel>[:<coleccion>]'.

export type Cuadricula = { cols: number; filas: number; paginas: 1 | 2 };
export type OpcionCuadricula = { cols: number; filas: number; id: string };

const opcion = (cols: number, filas: number): OpcionCuadricula => ({ cols, filas, id: `${cols}x${filas}` });
/** PC: 3×3, 3×4, 4×4, 4×5 y 4×6 (con 2 páginas, solo hasta 4×4 para que entren); celular: 3×3, 3×4 y 4×5. */
export const OPCIONES_PC: OpcionCuadricula[] = [opcion(3, 3), opcion(3, 4), opcion(4, 4), opcion(4, 5), opcion(4, 6)];
export const OPCIONES_PC_DOBLE: OpcionCuadricula[] = OPCIONES_PC.filter(o => o.cols * o.filas <= 16);
export const OPCIONES_CELULAR: OpcionCuadricula[] = [opcion(3, 3), opcion(3, 4), opcion(4, 5)];
export const POR_DEFECTO_PC: Cuadricula = { cols: 4, filas: 5, paginas: 1 };
export const POR_DEFECTO_CELULAR: Cuadricula = { cols: 3, filas: 3, paginas: 1 };

export function opcionesDe(esPC: boolean, paginas: 1 | 2): OpcionCuadricula[] {
  return esPC ? (paginas === 2 ? OPCIONES_PC_DOBLE : OPCIONES_PC) : OPCIONES_CELULAR;
}

/** Deja la cuadrícula dentro de las opciones válidas del modo (PC/celular) y del número de páginas. */
export function normalizar(c: Partial<Cuadricula> | null | undefined, esPC: boolean): Cuadricula {
  const base = esPC ? POR_DEFECTO_PC : POR_DEFECTO_CELULAR;
  const paginas: 1 | 2 = esPC && c?.paginas === 2 ? 2 : 1;
  const ops = opcionesDe(esPC, paginas);
  const cols = Number(c?.cols), filas = Number(c?.filas);
  const valida = ops.find(o => o.cols === cols && o.filas === filas);
  if (valida) return { cols, filas, paginas };
  // con 2 páginas, una cuadrícula más grande que 4×4 baja a 4×4
  if (paginas === 2 && cols * filas > 16) return { cols: 4, filas: 4, paginas };
  return { ...base, paginas: esPC ? paginas : 1 };
}

const clave = (usuarioId: string | null | undefined, esPC: boolean, setId?: string) => `poketcg:cuadricula:${usuarioId || 'anon'}:${esPC ? 'pc' : 'cel'}${setId ? `:${setId}` : ''}`;

export function cuadriculaGuardada(usuarioId: string | null | undefined, esPC: boolean, setId?: string): Cuadricula {
  try {
    const propia = setId ? localStorage.getItem(clave(usuarioId, esPC, setId)) : null;
    const general = localStorage.getItem(clave(usuarioId, esPC));
    const txt = propia || general;
    return normalizar(txt ? JSON.parse(txt) : null, esPC);
  } catch { return normalizar(null, esPC); }
}

export function guardarCuadricula(c: Cuadricula, usuarioId: string | null | undefined, esPC: boolean, setId?: string) {
  try {
    const txt = JSON.stringify(c);
    localStorage.setItem(clave(usuarioId, esPC), txt);           // la última elección vale para los demás álbumes
    if (setId) localStorage.setItem(clave(usuarioId, esPC, setId), txt);   // y se recuerda para este álbum
  } catch { /* sin almacenamiento */ }
}

/** Cuadrícula del álbum: se lee al entrar (por usuario y álbum) y se guarda al cambiarla. */
export function useCuadricula(usuarioId: string | null | undefined, setId: string | undefined, esPC: boolean) {
  const [cuad, setCuadEstado] = useState<Cuadricula>(() => normalizar(null, esPC));
  const actual = useRef(cuad);
  actual.current = cuad;
  useEffect(() => { setCuadEstado(cuadriculaGuardada(usuarioId, esPC, setId)); }, [usuarioId, esPC, setId]);
  const setCuad = useCallback((cambio: Partial<Cuadricula>) => {
    const nueva = normalizar({ ...actual.current, ...cambio }, esPC);
    guardarCuadricula(nueva, usuarioId, esPC, setId);
    setCuadEstado(nueva);
  }, [usuarioId, esPC, setId]);
  return { cuad, setCuad, opciones: opcionesDe(esPC, cuad.paginas) };
}
