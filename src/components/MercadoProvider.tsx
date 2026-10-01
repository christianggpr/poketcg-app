'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { liberarReserva, miCarrito, reservarCopia, type LineaCarrito, type ResultadoReserva } from '@/lib/mercado';
import { agregarFavorito, misFavoritos, quitarFavorito } from '@/lib/favoritos';
import { supabaseBrowser } from '@/lib/supabase/client';
import { usePerfil } from './PerfilProvider';

type Ctx = {
  /** Mis reservas activas (carrito). */
  carrito: LineaCarrito[];
  cargado: boolean;
  total: number;
  unidades: number;
  recargarCarrito: () => Promise<void>;
  reservar: (publicacionId: string, cantidad?: number) => Promise<ResultadoReserva>;
  liberar: (reservaId: string) => Promise<boolean>;
  /** Avisa cada vez que cambia algo en el mercado (tiempo real) con la carta afectada, o null si es general. */
  suscribir: (cb: (cartaId: string | null) => void) => () => void;
  /** Cambia con cada aviso del mercado: sirve de dependencia para volver a consultar. */
  version: number;
  /** Lista de deseos: ids de carta marcadas como favoritas (más reciente primero). */
  favoritos: string[];
  esFavorita: (cartaId: string) => boolean;
  /** Marca o desmarca una carta; devuelve el estado nuevo. */
  alternarFavorita: (cartaId: string) => Promise<boolean>;
};

const MercadoCtx = createContext<Ctx | null>(null);

export function MercadoProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil();
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [cargado, setCargado] = useState(false);
  const [version, setVersion] = useState(0);
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const oyentes = useRef(new Set<(cartaId: string | null) => void>());
  const canal = useRef<RealtimeChannel | null>(null);

  const recargarCarrito = useCallback(async () => {
    try { setCarrito(await miCarrito()); } catch { /* la función puede no existir hasta pegar 0002_fase2.sql */ }
    setCargado(true);
  }, []);

  useEffect(() => {
    recargarCarrito();
    misFavoritos().then(setFavoritos).catch(() => { /* la tabla puede no existir hasta pegar 0004_fase4.sql */ });
    const sb = supabaseBrowser();
    const avisar = (cartaId: string | null) => { setVersion(v => v + 1); for (const cb of oyentes.current) cb(cartaId); };
    const ch = sb.channel('mercado-' + perfil.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas', filter: `comprador_id=eq.${perfil.id}` }, () => { recargarCarrito(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mercado_eventos' }, p => avisar((p.new as { carta_id: string | null }).carta_id || null))
      .subscribe();
    canal.current = ch;
    const alVolver = () => { if (document.visibilityState === 'visible') { recargarCarrito(); avisar(null); } };
    document.addEventListener('visibilitychange', alVolver);
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', alVolver); };
  }, [perfil.id, recargarCarrito]);

  const api = useMemo<Ctx>(() => ({
    carrito, cargado, version, favoritos,
    esFavorita: cartaId => favoritos.includes(cartaId),
    async alternarFavorita(cartaId) {
      const era = favoritos.includes(cartaId);
      setFavoritos(f => (era ? f.filter(x => x !== cartaId) : [cartaId, ...f]));   // optimista
      try { if (era) await quitarFavorito(cartaId); else await agregarFavorito(cartaId); }
      catch (e) { setFavoritos(f => (era ? [cartaId, ...f] : f.filter(x => x !== cartaId))); throw e; }
      return !era;
    },
    total: Math.round(carrito.reduce((s, l) => s + l.precio_pen * l.cantidad, 0) * 100) / 100,
    unidades: carrito.reduce((s, l) => s + l.cantidad, 0),
    recargarCarrito,
    async reservar(publicacionId, cantidad = 1) {
      const r = await reservarCopia(publicacionId, cantidad);
      if (r.ok) { await recargarCarrito(); setVersion(v => v + 1); }
      return r;
    },
    async liberar(reservaId) {
      const r = await liberarReserva(reservaId);
      if (r.ok) { setCarrito(x => x.filter(l => l.id !== reservaId)); setVersion(v => v + 1); }
      return r.ok;
    },
    suscribir(cb) { oyentes.current.add(cb); return () => { oyentes.current.delete(cb); }; }
  }), [carrito, cargado, version, favoritos, recargarCarrito]);

  return <MercadoCtx.Provider value={api}>{children}</MercadoCtx.Provider>;
}

export function useMercado(): Ctx {
  const c = useContext(MercadoCtx);
  if (!c) throw new Error('useMercado fuera de MercadoProvider');
  return c;
}
