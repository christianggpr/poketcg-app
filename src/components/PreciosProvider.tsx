'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Carta } from '@/lib/catalogo';
import { FX_FALLBACK, valorDe, type RegistroPrecio, type Valor } from '@/lib/precios-core';

type Ctx = {
  version: number;
  fx: number;
  registro: (id: string) => RegistroPrecio | undefined;
  valor: (carta: Carta | null | undefined, acabado: string) => Valor | null;
  pedir: (ids: string[], forzar?: boolean) => Promise<void>;
  cargando: boolean;
};
const PreciosCtx = createContext<Ctx | null>(null);

export function PreciosProvider({ children }: { children: React.ReactNode }) {
  const cache = useRef(new Map<string, RegistroPrecio>());
  const pedidos = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  const [fx, setFx] = useState(FX_FALLBACK);
  const [cargando, setCargando] = useState(false);

  const cola = useRef(new Set<string>());
  const colaForzar = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esperando = useRef<(() => void)[]>([]);

  const vaciar = useCallback(async () => {
    temporizador.current = null;
    const faltan = [...cola.current];
    const forzar = colaForzar.current;
    cola.current = new Set(); colaForzar.current = false;
    const avisar = esperando.current; esperando.current = [];
    if (!faltan.length) { avisar.forEach(f => f()); return; }
    faltan.forEach(id => pedidos.current.add(id));
    setCargando(true);
    try {
      for (let i = 0; i < faltan.length; i += 150) {
        const lote = faltan.slice(i, i + 150);
        const r = await fetch('/api/precios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: lote, forzar }) });
        const j = await r.json().catch(() => ({}));
        if (j && j.ok) {
          for (const rec of j.registros as RegistroPrecio[]) cache.current.set(rec.id, rec);
          if (j.fx) setFx(j.fx);
          setVersion(v => v + 1);
        }
      }
    } finally {
      faltan.forEach(id => pedidos.current.delete(id));
      setCargando(false);
      avisar.forEach(f => f());
    }
  }, []);

  /** Pide precios; las llamadas cercanas en el tiempo se agrupan en una sola petición. */
  const pedir = useCallback((ids: string[], forzar = false) => {
    const faltan = ids.filter(id => forzar || (!cache.current.has(id) && !pedidos.current.has(id)));
    if (!faltan.length) return Promise.resolve();
    faltan.forEach(id => cola.current.add(id));
    if (forzar) colaForzar.current = true;
    return new Promise<void>(resolve => {
      esperando.current.push(resolve);
      if (!temporizador.current) temporizador.current = setTimeout(vaciar, 80);
    });
  }, [vaciar]);

  const api = useMemo<Ctx>(() => ({
    version, fx, cargando, pedir,
    registro: id => cache.current.get(id),
    valor: (carta, acabado) => (carta ? valorDe(cache.current.get(carta.id), acabado, fx) : null)
  }), [version, fx, cargando, pedir]);
  return <PreciosCtx.Provider value={api}>{children}</PreciosCtx.Provider>;
}

export function usePrecios(): Ctx {
  const c = useContext(PreciosCtx);
  if (!c) throw new Error('usePrecios fuera de PreciosProvider');
  return c;
}
