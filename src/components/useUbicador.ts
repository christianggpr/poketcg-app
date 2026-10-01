'use client';
import { useMemo } from 'react';
import { Ubicador } from '@/lib/coleccion';
import { useCatalogo } from './CatalogoProvider';
import { useColeccion } from './ColeccionProvider';
import { usePerfil } from './PerfilProvider';

/** Ubicador (caja + posición de cada entrada) recalculado cuando cambia la colección. */
export function useUbicador(): Ubicador {
  const cat = useCatalogo();
  const { cajas, entradas, albumes, casillas } = useColeccion();
  const { perfil } = usePerfil();
  return useMemo(() => new Ubicador(cat, cajas, entradas, perfil.idioma_nombres, albumes, casillas), [cat, cajas, entradas, perfil.idioma_nombres, albumes, casillas]);
}
