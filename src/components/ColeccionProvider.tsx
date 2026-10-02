'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Album, Caja, Casilla, Entrada, Publicacion } from '@/lib/coleccion';
import { cajasOrdenadas, PUBLICACION_VIVA } from '@/lib/coleccion';
import { borrarFotos } from '@/lib/fotos';
import { usePerfil } from './PerfilProvider';

export type NuevaEntrada = { carta_id?: string | null; personalizada?: { nombre: string; coleccion?: string; numero?: string } | null; caja_id: string | null; cantidad?: number; acabado?: string; idioma?: string; condicion?: string; nota?: string; /** no sumar a una entrada igual que ya exista (p. ej. la copia que va a una casilla de álbum) */ sinFusionar?: boolean };

type Ctx = {
  cargado: boolean;
  error: string;
  cajas: Caja[];
  entradas: Entrada[];
  albumes: Album[];
  /** Mejoras 1: todos los bolsillos de mis álbumes personalizados (para ubicaciones y sugerencias). */
  casillas: Casilla[];
  publicaciones: Publicacion[];
  ultimaCajaId: string | null;
  recargar: () => Promise<void>;
  recargarCasillas: () => Promise<void>;
  /** Mejoras 1: guarda una entrada en un álbum por colección (sale del Bulk y de cualquier bolsillo). */
  colocarEnColeccion: (entradaId: string, setId: string) => Promise<boolean>;
  /** Mejoras 1: guarda una entrada en el bolsillo de un álbum personalizado (sale del Bulk). */
  colocarEnAlbum: (entradaId: string, albumId: string, indice: number) => Promise<boolean>;
  crearCaja: (datos: { nombre: string; descripcion?: string; modo?: 'auto' | 'manual'; orden_colecciones?: 'asc' | 'desc' }) => Promise<Caja | null>;
  editarCaja: (id: string, datos: Partial<Pick<Caja, 'nombre' | 'descripcion' | 'modo' | 'orden_colecciones' | 'en_venta' | 'preguntar_venta'>>) => Promise<boolean>;
  moverCaja: (id: string, dir: -1 | 1) => Promise<void>;
  eliminarCaja: (id: string, conCartas: boolean) => Promise<boolean>;
  agregarEntrada: (d: NuevaEntrada) => Promise<{ entrada: Entrada; fusionada: boolean } | null>;
  editarEntrada: (id: string, datos: Partial<Pick<Entrada, 'cantidad' | 'acabado' | 'idioma' | 'condicion' | 'nota' | 'caja_id' | 'posicion' | 'album_coleccion'>>) => Promise<boolean>;
  editarVarias: (ids: string[], datos: Partial<Pick<Entrada, 'idioma' | 'acabado' | 'condicion' | 'caja_id'>>) => Promise<number>;
  eliminarEntrada: (id: string) => Promise<boolean>;
  crearAlbum: (d: { nombre: string; descripcion?: string; paginas: number; columnas: number; filas: number; color?: string; marca_agua?: string; tipo_album?: string; parametros?: Record<string, unknown> }) => Promise<Album | null>;
  /** Mejoras 5 · B: asigna cartas a bolsillos en lote (upsert por album_id + indice). */
  asignarBolsillos: (albumId: string, filas: { indice: number; carta_id: string }[]) => Promise<boolean>;
  /**
   * Mejoras 5 · B ("¿Ponerlas en este álbum?"): mueve copias que ya tengo a sus bolsillos, en lote. Si una pila tiene varias,
   * separa 1 (dividir_entrada) y mueve esa. Devuelve cuántas quedaron en el álbum.
   */
  ponerEnBolsillos: (albumId: string, pares: { indice: number; entrada: Entrada; set: string }[]) => Promise<number>;
  editarAlbum: (id: string, d: Partial<Pick<Album, 'nombre' | 'descripcion' | 'paginas' | 'columnas' | 'filas' | 'color' | 'marca_agua'>>) => Promise<boolean>;
  eliminarAlbum: (id: string) => Promise<boolean>;
  /** Mejoras 5 · B: la base no tiene aún las columnas tipo_album / parametros (0011 sin pegar). */
  sinTipoAlbum: boolean;
  casillasDe: (albumId: string) => Promise<Casilla[]>;
  guardarCasilla: (albumId: string, indice: number, carta_id: string | null, entrada_id?: string | null) => Promise<boolean>;
  moverCasilla: (albumId: string, de: number, a: number) => Promise<boolean>;
  // Fase 2 · publicaciones en el mercado
  publicacionDe: (entradaId: string) => Publicacion | undefined;
  recargarPublicaciones: () => Promise<void>;
  publicar: (entradaId: string, d?: { cantidad?: number; tipo_precio?: 'defecto' | 'manual'; precio_pen?: number }) => Promise<Publicacion | null>;
  /** Publica varias entradas con el precio por defecto: toda la cantidad (id) o parte ({ entrada_id, cantidad }). */
  publicarVarias: (items: (string | { entrada_id: string; cantidad: number })[]) => Promise<number>;
  editarPublicacion: (id: string, d: Partial<Pick<Publicacion, 'cantidad' | 'tipo_precio' | 'precio_pen' | 'estado' | 'fotos'>>) => Promise<Publicacion | null>;
  cambiarEstado: (ids: string[], estado: 'activa' | 'pausada' | 'retirada') => Promise<number>;
  // Mejoras 2 · B: el álbum es lo principal; el Bulk guarda las repetidas (funciones de la base, 0006_mejoras2.sql)
  /** Separa `cantidad` copias de una entrada en una entrada nueva, en un Bulk o en el álbum por colección. */
  dividirEntrada: (entradaId: string, cantidad: number, destino: { caja?: string | null; album?: string | null }) => Promise<{ ok: boolean; nueva?: string; posicion?: number; error?: string }>;
  /** Asistente "Ordenar repetidas": manda a un Bulk las copias de más de los álbumes (una sola transacción). */
  ordenarRepetidas: (cajaId: string, items: { entrada: string; cantidad: number; todo: boolean }[]) => Promise<{ ok: boolean; movidas: number; copias: number; omitidas: { entrada: string; error: string }[]; error?: string }>;
  /** Asistente "Llenar álbumes desde Bulk": 1 copia de cada entrada a su casilla vacía. */
  llenarAlbumes: (items: { entrada: string; set: string }[]) => Promise<{ ok: boolean; movidas: number; omitidas: { entrada: string; error: string }[]; error?: string }>;
};

const ColeccionCtx = createContext<Ctx | null>(null);

export function ColeccionProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = usePerfil();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [albumes, setAlbumes] = useState<Album[]>([]);
  const [casillas, setCasillas] = useState<Casilla[]>([]);
  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState('');
  const [ultimaCajaId, setUltimaCajaId] = useState<string | null>(null);
  const [avisoTipo, setAvisoTipo] = useState(false);   // Mejoras 5 · B: 0011 sin pegar (los álbumes no recuerdan su tipo)
  const canal = useRef<RealtimeChannel | null>(null);

  // Las publicaciones se recargan aparte: los disparadores de la base pueden crearlas o ajustarlas solos
  // (caja en venta, cambios de cantidad) y el tiempo real puede llegar con retraso.
  const recargarPublicaciones = useCallback(async () => {
    const p = await supabaseBrowser().from('publicaciones').select('*').in('estado', ['activa', 'pausada', 'reservada']).order('creada');
    if (!p.error) setPublicaciones(p.data as Publicacion[]);   // la tabla puede no existir hasta pegar 0002_fase2.sql
  }, []);
  const recargarCasillas = useCallback(async () => {
    const r = await supabaseBrowser().from('album_casillas').select('*').order('album_id').order('indice');
    if (!r.error) setCasillas(r.data as Casilla[]);
  }, []);
  const recargar = useCallback(async () => {
    const sb = supabaseBrowser();
    const [c, e, a] = await Promise.all([
      sb.from('cajas').select('*').order('orden'),
      sb.from('entradas').select('*').order('creado_en'),
      sb.from('albumes').select('*').order('creado_en'),
      recargarPublicaciones(),
      recargarCasillas()
    ]);
    if (c.error || e.error || a.error) { setError((c.error || e.error || a.error)!.message); return; }
    setCajas(c.data as Caja[]); setEntradas(e.data as Entrada[]); setAlbumes(a.data as Album[]);
    setError(''); setCargado(true);
  }, [recargarPublicaciones, recargarCasillas]);

  useEffect(() => {
    recargar();
    try { setUltimaCajaId(localStorage.getItem('poketcg:ultimaCaja')); } catch { /* sin almacenamiento */ }
    const sb = supabaseBrowser();
    // Tiempo real: cualquier cambio (desde este u otro dispositivo) actualiza la lista al instante
    const ch = sb.channel('coleccion-' + perfil.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cajas', filter: `usuario_id=eq.${perfil.id}` }, p => aplicar(setCajas, p.eventType, p.new as Caja, p.old as Partial<Caja>))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entradas', filter: `usuario_id=eq.${perfil.id}` }, p => aplicar(setEntradas, p.eventType, p.new as Entrada, p.old as Partial<Entrada>))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'albumes', filter: `usuario_id=eq.${perfil.id}` }, p => aplicar(setAlbumes, p.eventType, p.new as Album, p.old as Partial<Album>))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'publicaciones', filter: `usuario_id=eq.${perfil.id}` }, p => {
        const nueva = p.new as Publicacion;
        if (p.eventType === 'DELETE' || (nueva && !PUBLICACION_VIVA.has(nueva.estado))) setPublicaciones(x => x.filter(f => f.id !== ((p.old as Partial<Publicacion>).id || nueva?.id)));
        else setPublicaciones(x => upsert(x, nueva));
      })
      .subscribe();
    canal.current = ch;
    const alVolver = () => { if (document.visibilityState === 'visible') recargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { sb.removeChannel(ch); document.removeEventListener('visibilitychange', alVolver); };
  }, [perfil.id, recargar]);

  function recordarCaja(id: string | null) {
    setUltimaCajaId(id);
    try { if (id) localStorage.setItem('poketcg:ultimaCaja', id); } catch { /* sin almacenamiento */ }
  }

  const api = useMemo<Ctx>(() => ({
    cargado, error, cajas, entradas, albumes, casillas, publicaciones, ultimaCajaId, recargar, recargarPublicaciones, recargarCasillas, sinTipoAlbum: avisoTipo,
    async colocarEnColeccion(entradaId, setId) {
      const sb = supabaseBrowser();
      const { data, error } = await sb.from('entradas').update({ caja_id: null, posicion: null, album_coleccion: setId }).eq('id', entradaId).select('*').single();
      if (error) { setError(error.message); return false; }
      await sb.from('album_casillas').update({ entrada_id: null }).eq('entrada_id', entradaId);   // ya no está en un bolsillo
      setEntradas(x => upsert(x, data as Entrada));
      setCasillas(x => x.map(c => (c.entrada_id === entradaId ? { ...c, entrada_id: null } : c)));
      if (publicaciones.some(p => p.entrada_id === entradaId)) await recargarPublicaciones();
      return true;
    },
    async colocarEnAlbum(entradaId, albumId, indice) {
      const sb = supabaseBrowser();
      const ocupado = casillas.find(c => c.album_id === albumId && c.indice === indice && c.entrada_id && c.entrada_id !== entradaId);
      if (ocupado) { setError('Ese bolsillo ya tiene una carta.'); return false; }
      // Mejoras 5 · A1: la carta del bolsillo se toma de la copia (si acaba de crearse y aún no está en memoria, se lee de la base)
      let cartaId: string | null = entradas.find(x => x.id === entradaId)?.carta_id ?? null;
      if (!cartaId) { const r = await sb.from('entradas').select('carta_id').eq('id', entradaId).maybeSingle(); cartaId = (r.data as { carta_id: string | null } | null)?.carta_id ?? null; }
      if (!cartaId) { const r = await sb.from('album_casillas').select('carta_id').eq('album_id', albumId).eq('indice', indice).maybeSingle(); cartaId = (r.data as { carta_id: string | null } | null)?.carta_id ?? null; }
      const { error: e1 } = await sb.from('album_casillas').upsert({ album_id: albumId, indice, carta_id: cartaId, entrada_id: entradaId }, { onConflict: 'album_id,indice' });
      if (e1) { setError(e1.message); return false; }
      await sb.from('album_casillas').update({ entrada_id: null }).eq('entrada_id', entradaId).neq('album_id', albumId);
      const { data, error } = await sb.from('entradas').update({ caja_id: null, posicion: null, album_coleccion: null }).eq('id', entradaId).select('*').single();
      if (error) { setError(error.message); return false; }
      setEntradas(x => upsert(x, data as Entrada));
      await recargarCasillas();
      if (publicaciones.some(p => p.entrada_id === entradaId)) await recargarPublicaciones();
      return true;
    },
    async crearCaja(d) {
      const orden = cajas.reduce((m, c) => Math.max(m, c.orden), 0) + 1;
      const { data, error } = await supabaseBrowser().from('cajas').insert({ nombre: d.nombre.trim() || `Bulk ${cajas.length + 1}`, descripcion: d.descripcion || '', modo: d.modo || 'auto', orden_colecciones: d.orden_colecciones || 'asc', orden }).select('*').single();
      if (error) { setError(error.message); return null; }
      setCajas(x => upsert(x, data as Caja));
      return data as Caja;
    },
    async editarCaja(id, d) {
      const { data, error } = await supabaseBrowser().from('cajas').update(d).eq('id', id).select('*').single();
      if (error) { setError(error.message); return false; }
      setCajas(x => upsert(x, data as Caja));
      if (d.en_venta) await recargarPublicaciones();   // la base publica sola todas las cartas de la caja
      return true;
    },
    async moverCaja(id, dir) {
      const lista = cajasOrdenadas(cajas);
      const i = lista.findIndex(c => c.id === id); const j = i + dir;
      if (i < 0 || j < 0 || j >= lista.length) return;
      const [b] = lista.splice(i, 1); lista.splice(j, 0, b);
      const cambios = lista.map((c, k) => ({ ...c, orden: k + 1 })).filter((c, k) => lista[k].orden !== k + 1);
      setCajas(lista.map((c, k) => ({ ...c, orden: k + 1 })));
      await Promise.all(cambios.map(c => supabaseBrowser().from('cajas').update({ orden: c.orden }).eq('id', c.id)));
    },
    async eliminarCaja(id, conCartas) {
      const sb = supabaseBrowser();
      if (conCartas) { const { error } = await sb.from('entradas').delete().eq('caja_id', id); if (error) { setError(error.message); return false; } }
      const { error } = await sb.from('cajas').delete().eq('id', id);
      if (error) { setError(error.message); return false; }
      if (conCartas) { const ids = new Set(entradas.filter(e => e.caja_id === id).map(e => e.id)); setPublicaciones(x => x.filter(p => !p.entrada_id || !ids.has(p.entrada_id))); }
      setEntradas(x => conCartas ? x.filter(e => e.caja_id !== id) : x.map(e => (e.caja_id === id ? { ...e, caja_id: null } : e)));
      setCajas(x => x.filter(c => c.id !== id));
      return true;
    },
    async agregarEntrada(d) {
      const sb = supabaseBrowser();
      const cantidad = Math.max(1, Math.floor(d.cantidad || 1));
      // misma carta, acabado e idioma en el mismo Bulk (o por colocar) → se suma; nunca a una copia que está en un álbum o bolsillo
      const existente = d.carta_id && !d.sinFusionar ? entradas.find(e => e.caja_id === d.caja_id && e.carta_id === d.carta_id && (e.acabado || '') === (d.acabado || '') && (e.idioma || '') === (d.idioma || '') && !e.album_coleccion && !casillas.some(c => c.entrada_id === e.id)) : null;
      if (existente) {
        const { data, error } = await sb.from('entradas').update({ cantidad: existente.cantidad + cantidad, nota: d.nota ? d.nota : existente.nota }).eq('id', existente.id).select('*').single();
        if (error) { setError(error.message); return null; }
        setEntradas(x => upsert(x, data as Entrada));
        recordarCaja(d.caja_id);
        if (cajas.find(c => c.id === d.caja_id)?.en_venta || publicaciones.some(p => p.entrada_id === existente.id)) await recargarPublicaciones();
        return { entrada: data as Entrada, fusionada: true };
      }
      const maxPos = entradas.filter(e => e.caja_id === d.caja_id).reduce((m, e) => Math.max(m, e.posicion || 0), 0);
      const fila = { carta_id: d.carta_id || null, personalizada: d.personalizada || null, caja_id: d.caja_id, cantidad, acabado: d.acabado || '', idioma: d.idioma || '', condicion: d.condicion || '', nota: d.nota || '', posicion: maxPos + 1 };
      const { data, error } = await sb.from('entradas').insert(fila).select('*').single();
      if (error) { setError(error.message); return null; }
      setEntradas(x => upsert(x, data as Entrada));
      recordarCaja(d.caja_id);
      if (d.carta_id && cajas.find(c => c.id === d.caja_id)?.en_venta) await recargarPublicaciones();   // caja en venta: se publicó sola
      return { entrada: data as Entrada, fusionada: false };
    },
    async editarEntrada(id, d) {
      const datos: Record<string, unknown> = { ...d };
      let saleDelAlbum = false;
      if (d.caja_id !== undefined) {
        const actual = entradas.find(e => e.id === id);
        if (actual && actual.caja_id !== d.caja_id) datos.posicion = entradas.filter(e => e.caja_id === d.caja_id).reduce((m, e) => Math.max(m, e.posicion || 0), 0) + 1;
        if (d.caja_id) { datos.album_coleccion = null; saleDelAlbum = true; }   // al ir a un Bulk deja el álbum y el bolsillo
      }
      const { data, error } = await supabaseBrowser().from('entradas').update(datos).eq('id', id).select('*').single();
      if (error) { setError(error.message); return false; }
      if (saleDelAlbum && casillas.some(c => c.entrada_id === id)) { await supabaseBrowser().from('album_casillas').update({ entrada_id: null }).eq('entrada_id', id); setCasillas(x => x.map(c => (c.entrada_id === id ? { ...c, entrada_id: null } : c))); }
      setEntradas(x => upsert(x, data as Entrada));
      const nueva = data as Entrada;
      if (publicaciones.some(p => p.entrada_id === id) || cajas.find(c => c.id === nueva.caja_id)?.en_venta) await recargarPublicaciones();
      return true;
    },
    async editarVarias(ids, d) {
      const sb = supabaseBrowser();
      let n = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { data, error } = await sb.from('entradas').update(d).in('id', lote).select('*');
        if (error) { setError(error.message); break; }
        const filas = data as Entrada[];
        n += filas.length;
        setEntradas(x => { let y = x; for (const f of filas) y = upsert(y, f); return y; });
      }
      if (n && (publicaciones.length || (d.caja_id && cajas.find(c => c.id === d.caja_id)?.en_venta))) await recargarPublicaciones();
      return n;
    },
    async eliminarEntrada(id) {
      const { error } = await supabaseBrowser().from('entradas').delete().eq('id', id);
      if (error) { setError(error.message); return false; }
      setEntradas(x => x.filter(e => e.id !== id));
      setPublicaciones(x => x.filter(p => p.entrada_id !== id));   // la publicación se borra en cascada
      return true;
    },
    async crearAlbum(d) {
      // Mejoras 3 · A: color y marca de agua de la portada; Mejoras 5 · B: tipo y parámetros. Si la base aún no tiene esas
      // columnas (0008 / 0011 sin pegar), se crea sin ellas (primero sin tipo, luego sin portada).
      const base = { nombre: d.nombre.trim() || 'Álbum', descripcion: d.descripcion || '', paginas: d.paginas, columnas: d.columnas, filas: d.filas };
      const extra = sinPortada(d);
      const tipo: Record<string, unknown> = d.tipo_album && d.tipo_album !== 'libre' ? { tipo_album: d.tipo_album, parametros: d.parametros || {} } : {};
      const sb = supabaseBrowser();
      let r = await sb.from('albumes').insert({ ...base, ...extra, ...tipo }).select('*').single();
      if (r.error && Object.keys(tipo).length && columnaFalta(r.error)) { setAvisoTipo(true); r = await sb.from('albumes').insert({ ...base, ...extra }).select('*').single(); }
      if (r.error && Object.keys(extra).length && columnaFalta(r.error)) r = await sb.from('albumes').insert(base).select('*').single();
      if (r.error) { setError(r.error.message); return null; }
      setAlbumes(x => upsert(x, r.data as Album));
      return r.data as Album;
    },
    async asignarBolsillos(albumId, filas) {
      const sb = supabaseBrowser();
      for (let k = 0; k < filas.length; k += 200) {
        const { error } = await sb.from('album_casillas').upsert(filas.slice(k, k + 200).map(f => ({ album_id: albumId, indice: f.indice, carta_id: f.carta_id, entrada_id: null })), { onConflict: 'album_id,indice' });
        if (error) { setError(error.message); return false; }
      }
      await recargarCasillas();
      return true;
    },
    async ponerEnBolsillos(albumId, pares) {
      const sb = supabaseBrowser();
      const filas: { album_id: string; indice: number; carta_id: string | null; entrada_id: string }[] = [];
      for (const p of pares) {
        let id = p.entrada.id;
        if (p.entrada.cantidad > 1) {
          const { data, error } = await sb.rpc('dividir_entrada', { p_entrada: id, p_cantidad: 1, p_caja: null, p_album: p.set });
          const r = (data || {}) as { ok: boolean; nueva?: string; error?: string };
          if (error || !r.ok || !r.nueva) { setError(error?.message || r.error || 'No se pudo separar una copia'); continue; }
          id = r.nueva;
        }
        filas.push({ album_id: albumId, indice: p.indice, carta_id: p.entrada.carta_id, entrada_id: id });
      }
      if (!filas.length) return 0;
      for (let k = 0; k < filas.length; k += 200) {
        const { error } = await sb.from('album_casillas').upsert(filas.slice(k, k + 200), { onConflict: 'album_id,indice' });
        if (error) { setError(error.message); await recargar(); return 0; }
      }
      const ids = filas.map(f => f.entrada_id);
      await sb.from('album_casillas').update({ entrada_id: null }).in('entrada_id', ids).neq('album_id', albumId);
      const { error } = await sb.from('entradas').update({ caja_id: null, posicion: null, album_coleccion: null }).in('id', ids);
      if (error) setError(error.message);
      await recargar();
      return error ? 0 : filas.length;
    },
    async editarAlbum(id, d) {
      const { color, marca_agua, ...resto } = d;
      const extra = sinPortada({ color, marca_agua });
      let r = await supabaseBrowser().from('albumes').update({ ...resto, ...extra }).eq('id', id).select('*').single();
      if (r.error && Object.keys(extra).length && columnaFalta(r.error)) r = await supabaseBrowser().from('albumes').update(resto).eq('id', id).select('*').single();
      if (r.error) { setError(r.error.message); return false; }
      setAlbumes(x => upsert(x, r.data as Album));
      return true;
    },
    async eliminarAlbum(id) {
      const { error } = await supabaseBrowser().from('albumes').delete().eq('id', id);
      if (error) { setError(error.message); return false; }
      setAlbumes(x => x.filter(a => a.id !== id));
      return true;
    },
    async casillasDe(albumId) {
      const { data, error } = await supabaseBrowser().from('album_casillas').select('*').eq('album_id', albumId).order('indice');
      if (error) { setError(error.message); return []; }
      return data as Casilla[];
    },
    async guardarCasilla(albumId, indice, carta_id, entrada_id = null) {
      const sb = supabaseBrowser();
      if (!carta_id && !entrada_id) {
        const { error } = await sb.from('album_casillas').delete().eq('album_id', albumId).eq('indice', indice);
        if (error) { setError(error.message); return false; }
        recargarCasillas();
        return true;
      }
      const { error } = await sb.from('album_casillas').upsert({ album_id: albumId, indice, carta_id, entrada_id }, { onConflict: 'album_id,indice' });
      if (error) { setError(error.message); return false; }
      recargarCasillas();
      return true;
    },
    async moverCasilla(albumId, de, a) {
      if (de === a) return true;
      const sb = supabaseBrowser();
      const { data } = await sb.from('album_casillas').select('*').eq('album_id', albumId).in('indice', [de, a]);
      const origen = (data || []).find(c => c.indice === de) as Casilla | undefined;
      const destino = (data || []).find(c => c.indice === a) as Casilla | undefined;
      if (!origen) return false;
      await sb.from('album_casillas').delete().eq('album_id', albumId).in('indice', [de, a]);
      const filas = [{ album_id: albumId, indice: a, carta_id: origen.carta_id, entrada_id: origen.entrada_id }];
      if (destino) filas.push({ album_id: albumId, indice: de, carta_id: destino.carta_id, entrada_id: destino.entrada_id });
      const { error } = await sb.from('album_casillas').insert(filas);
      if (error) { setError(error.message); return false; }
      recargarCasillas();
      return true;
    },
    publicacionDe: entradaId => publicaciones.find(p => p.entrada_id === entradaId && PUBLICACION_VIVA.has(p.estado)),
    async publicar(entradaId, d = {}) {
      const sb = supabaseBrowser();
      const existente = publicaciones.find(p => p.entrada_id === entradaId && PUBLICACION_VIVA.has(p.estado));
      const entrada = entradas.find(e => e.id === entradaId);
      const fila = { entrada_id: entradaId, cantidad: d.cantidad ?? entrada?.cantidad ?? 1, tipo_precio: d.tipo_precio || 'defecto', precio_pen: d.precio_pen ?? 0, estado: 'activa' };
      const q = existente ? sb.from('publicaciones').update(fila).eq('id', existente.id) : sb.from('publicaciones').insert(fila);
      const { data, error } = await q.select('*').single();
      if (error) { setError(error.message); return null; }
      setPublicaciones(x => upsert(x, data as Publicacion));
      return data as Publicacion;
    },
    async publicarVarias(items) {
      const sb = supabaseBrowser();
      const nuevas = items.map(it => (typeof it === 'string' ? { id: it, cantidad: null } : { id: it.entrada_id, cantidad: it.cantidad }))
        .filter(it => !publicaciones.some(p => p.entrada_id === it.id && PUBLICACION_VIVA.has(p.estado)))
        .map(it => { const e = entradas.find(x => x.id === it.id); const cantidad = Math.min(e?.cantidad || 0, it.cantidad ?? e?.cantidad ?? 0); return e && e.carta_id && cantidad > 0 ? { entrada_id: it.id, cantidad, tipo_precio: 'defecto' } : null; })
        .filter((x): x is { entrada_id: string; cantidad: number; tipo_precio: string } => !!x);
      let n = 0;
      for (let i = 0; i < nuevas.length; i += 100) {
        const { data, error } = await sb.from('publicaciones').insert(nuevas.slice(i, i + 100)).select('*');
        if (error) { setError(error.message); break; }
        const filas = data as Publicacion[]; n += filas.length;
        setPublicaciones(x => { let y = x; for (const f of filas) y = upsert(y, f); return y; });
      }
      return n;
    },
    async editarPublicacion(id, d) {
      const { data, error } = await supabaseBrowser().from('publicaciones').update(d).eq('id', id).select('*').single();
      if (error) { setError(error.message); return null; }
      const pub = data as Publicacion;
      setPublicaciones(x => (PUBLICACION_VIVA.has(pub.estado) ? upsert(x, pub) : x.filter(p => p.id !== id)));
      return pub;
    },
    async cambiarEstado(ids, estado) {
      if (!ids.length) return 0;
      const sb = supabaseBrowser();
      const { data, error } = await sb.from('publicaciones').update({ estado }).in('id', ids).select('*');
      if (error) { setError(error.message); return 0; }
      const filas = data as Publicacion[];
      if (estado === 'retirada') {
        // las fotos se borran al retirar
        const fotos = publicaciones.filter(p => ids.includes(p.id)).flatMap(p => p.fotos || []);
        borrarFotos(fotos).catch(() => {});
        await sb.from('publicaciones').update({ fotos: [] }).in('id', ids);
        setPublicaciones(x => x.filter(p => !ids.includes(p.id)));
      } else setPublicaciones(x => { let y = x; for (const f of filas) y = upsert(y, f); return y; });
      return filas.length;
    },
    async dividirEntrada(entradaId, cantidad, destino) {
      const { data, error } = await supabaseBrowser().rpc('dividir_entrada', { p_entrada: entradaId, p_cantidad: cantidad, p_caja: destino.caja || null, p_album: destino.album || null });
      if (error) { setError(error.message); return { ok: false, error: error.message }; }
      const r = (data || {}) as { ok: boolean; nueva?: string; posicion?: number; error?: string };
      if (r.ok) await recargar(); else if (r.error) setError(r.error);
      return r;
    },
    async ordenarRepetidas(cajaId, items) {
      const { data, error } = await supabaseBrowser().rpc('ordenar_repetidas', { p_caja: cajaId, p_items: items });
      if (error) { setError(error.message); return { ok: false, movidas: 0, copias: 0, omitidas: [], error: error.message }; }
      const r = (data || {}) as { ok: boolean; movidas: number; copias: number; omitidas: { entrada: string; error: string }[]; error?: string };
      if (r.ok) { recordarCaja(cajaId); await recargar(); } else if (r.error) setError(r.error);
      return r;
    },
    async llenarAlbumes(items) {
      const { data, error } = await supabaseBrowser().rpc('llenar_albumes', { p_items: items });
      if (error) { setError(error.message); return { ok: false, movidas: 0, omitidas: [], error: error.message }; }
      const r = (data || {}) as { ok: boolean; movidas: number; omitidas: { entrada: string; error: string }[]; error?: string };
      if (r.ok) await recargar(); else if (r.error) setError(r.error);
      return r;
    }
  }), [cargado, error, cajas, entradas, albumes, casillas, publicaciones, ultimaCajaId, avisoTipo, recargar, recargarPublicaciones, recargarCasillas]);

  return <ColeccionCtx.Provider value={api}>{children}</ColeccionCtx.Provider>;
}

/** Mejoras 3 · A: columnas de la portada (solo las que vienen). */
function sinPortada(d: { color?: string | null; marca_agua?: string | null }): { color?: string; marca_agua?: string } {
  const o: { color?: string; marca_agua?: string } = {};
  if (d.color) o.color = d.color;
  if (d.marca_agua) o.marca_agua = d.marca_agua;
  return o;
}
/** La base aún no tiene esa columna (0008 sin pegar): PostgREST PGRST204 o Postgres 42703. */
const columnaFalta = (e: { code?: string; message?: string }) => e.code === 'PGRST204' || e.code === '42703' || /column|columna/i.test(e.message || '');

function upsert<T extends { id: string }>(lista: T[], fila: T): T[] {
  const i = lista.findIndex(x => x.id === fila.id);
  if (i < 0) return [...lista, fila];
  const copia = lista.slice(); copia[i] = fila; return copia;
}

function aplicar<T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>, tipo: string, nueva: T, vieja: Partial<T>) {
  if (tipo === 'DELETE') set(x => x.filter(f => f.id !== vieja.id));
  else set(x => upsert(x, nueva));
}

export function useColeccion(): Ctx {
  const c = useContext(ColeccionCtx);
  if (!c) throw new Error('useColeccion fuera de ColeccionProvider');
  return c;
}
