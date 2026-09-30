'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { Catalogo, cargarCatalogo } from '@/lib/catalogo';

type Ctx = { cat: Catalogo | null; estado: string; error: string };
const CatalogoCtx = createContext<Ctx>({ cat: null, estado: '', error: '' });

export function CatalogoProvider({ children }: { children: React.ReactNode }) {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [estado, setEstado] = useState('Cargando el catálogo…');
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    cargarCatalogo(t => { if (vivo) setEstado(t); }).then(c => { if (vivo) { setCat(c); setEstado(''); } }).catch(e => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, []);
  return <CatalogoCtx.Provider value={{ cat, estado, error }}>{children}</CatalogoCtx.Provider>;
}

export const useCatalogoOpcional = () => useContext(CatalogoCtx);
/** Catálogo ya cargado (las vistas se muestran solo cuando existe). */
export function useCatalogo(): Catalogo {
  const { cat } = useContext(CatalogoCtx);
  if (!cat) throw new Error('El catálogo todavía no está cargado');
  return cat;
}
