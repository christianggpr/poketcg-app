'use client';
import { createContext, useContext, useState } from 'react';
import type { Perfil } from '@/lib/coleccion';

type Ctx = { perfil: Perfil; setPerfil: (p: Perfil) => void };
const PerfilCtx = createContext<Ctx | null>(null);

export function PerfilProvider({ perfil: inicial, children }: { perfil: Perfil; children: React.ReactNode }) {
  const [perfil, setPerfil] = useState(inicial);
  return <PerfilCtx.Provider value={{ perfil, setPerfil }}>{children}</PerfilCtx.Provider>;
}

export function usePerfil(): Ctx {
  const c = useContext(PerfilCtx);
  if (!c) throw new Error('usePerfil fuera de PerfilProvider');
  return c;
}
