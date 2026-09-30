'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Notificacion } from '@/lib/compras';
import { supabaseBrowser } from '@/lib/supabase/client';
import { usePerfil } from './PerfilProvider';

type Ctx = { lista: Notificacion[]; noLeidas: number; cargado: boolean; recargar: () => Promise<void>; marcarLeidas: (ids?: number[]) => Promise<void> };
const NotifCtx = createContext<Ctx | null>(null);

/** Bandeja de notificaciones del usuario (tiempo real). */
export function NotificacionesProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil();
  const [lista, setLista] = useState<Notificacion[]>([]);
  const [cargado, setCargado] = useState(false);
  const recargar = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from('notificaciones').select('*').order('creada', { ascending: false }).limit(60);
    if (!error) setLista((data || []) as Notificacion[]);   // la tabla puede no existir hasta pegar 0003_fase3.sql
    setCargado(true);
  }, []);
  useEffect(() => {
    recargar();
    const sb = supabaseBrowser();
    const ch = sb.channel('notif-' + perfil.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${perfil.id}` }, p => setLista(x => [p.new as Notificacion, ...x.filter(n => n.id !== (p.new as Notificacion).id)].slice(0, 60)))
      .subscribe();
    const alVolver = () => { if (document.visibilityState === 'visible') recargar(); };
    document.addEventListener('visibilitychange', alVolver);
    const t = setInterval(() => { if (document.visibilityState === 'visible') recargar(); }, 45000);   // respaldo si el tiempo real no llega
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', alVolver); clearInterval(t); };
  }, [perfil.id, recargar]);
  const api = useMemo<Ctx>(() => ({
    lista, cargado, noLeidas: lista.filter(n => !n.leida_en).length, recargar,
    async marcarLeidas(ids) {
      const objetivo = ids || lista.filter(n => !n.leida_en).map(n => n.id);
      if (!objetivo.length) return;
      const ahora = new Date().toISOString();
      setLista(x => x.map(n => (objetivo.includes(n.id) ? { ...n, leida_en: n.leida_en || ahora } : n)));
      await supabaseBrowser().from('notificaciones').update({ leida_en: ahora }).in('id', objetivo).is('leida_en', null);
    }
  }), [lista, cargado, recargar]);
  return <NotifCtx.Provider value={api}>{children}</NotifCtx.Provider>;
}

export function useNotificaciones(): Ctx {
  const c = useContext(NotifCtx);
  if (!c) throw new Error('useNotificaciones fuera de NotificacionesProvider');
  return c;
}
