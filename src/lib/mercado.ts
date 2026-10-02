// Mercado (Fase 2 · bloque C): ofertas públicas, resumen por carta y reservas (carrito) sin pago.
import { supabaseBrowser } from './supabase/client';

/** Fila de la vista pública `mercado` (una publicación activa con copias disponibles). */
export type Oferta = {
  id: string;
  carta_id: string;
  cantidad: number;
  reservadas: number;
  disponibles: number;
  precio_pen: number;
  tipo_precio: 'defecto' | 'manual';
  precio_mercado_pen: number | null;
  acabado: string;
  idioma: string;
  condicion: string;
  fotos: string[];
  creada: string;
  actualizada: string;
  vendedor: string;
  vendedor_id: string;
};

/** Resumen por carta (función `mercado_resumen`); `vendidas` (90 días) llega con 0009. */
export type ResumenCarta = { carta_id: string; copias: number; precio_min: number; precio_max: number; vendedores: string[]; ofertas: number; ultima: string; vendidas?: number };

export type { OrdenMercado } from './filtros';
import type { OrdenMercado } from './filtros';
/** Mejoras 4 · D: filtros nuevos (tipo, rareza, ilustrador, con foto real, vendedor con buena reputación) y órdenes (más vendidas, nombre); necesitan 0009. */
export type FiltrosMercado = { cartas?: string[] | null; set?: string; idioma?: string; acabado?: string; condicion?: string; min?: number | null; max?: number | null; orden?: OrdenMercado; limite?: number; desde?: number; tipo?: string; rareza?: string; ilustrador?: string; foto?: boolean; reputacion?: boolean };

/** true cuando la base aún no tiene la función de 0009 (se descubre en la primera consulta que falla con PGRST202). */
let sinFuncionNueva = false;
export const mercadoSinFiltrosNuevos = () => sinFuncionNueva;
const necesitaNuevos = (f: FiltrosMercado) => !!(f.tipo || f.rareza || f.ilustrador || f.foto || f.reputacion || f.orden === 'ventas' || f.orden === 'nombre');

export async function resumenMercado(f: FiltrosMercado = {}): Promise<ResumenCarta[]> {
  const base = {
    p_cartas: f.cartas && f.cartas.length ? f.cartas : null, p_set: f.set || '', p_idioma: f.idioma || '', p_acabado: f.acabado || '', p_condicion: f.condicion || '',
    p_min: f.min ?? null, p_max: f.max ?? null, p_orden: f.orden || 'novedad', p_limite: f.limite ?? 60, p_desde: f.desde ?? 0
  };
  const nuevos = { p_tipo: f.tipo || '', p_rareza: f.rareza || '', p_ilustrador: f.ilustrador || '', p_con_foto: !!f.foto, p_reputacion: !!f.reputacion };
  let r = sinFuncionNueva ? null : await supabaseBrowser().rpc('mercado_resumen', { ...base, ...nuevos });
  if (!r || (r.error && (r.error.code === 'PGRST202' || /Could not find the function/i.test(r.error.message || '')))) {
    // la base todavía tiene la función antigua (0009 sin pegar): se consulta con los parámetros de siempre
    sinFuncionNueva = true;
    r = await supabaseBrowser().rpc('mercado_resumen', { ...base, p_orden: necesitaNuevos(f) && (f.orden === 'ventas' || f.orden === 'nombre') ? 'novedad' : base.p_orden });
  }
  if (r.error) throw new Error(r.error.message);
  return ((r.data || []) as ResumenCarta[]).map(x => ({ ...x, copias: Number(x.copias), precio_min: Number(x.precio_min), precio_max: Number(x.precio_max), ofertas: Number(x.ofertas), vendidas: x.vendidas == null ? undefined : Number(x.vendidas) }));
}

/** Ofertas activas de una carta, de la más barata a la más cara. */
export async function ofertasDe(cartaId: string): Promise<Oferta[]> {
  const { data, error } = await supabaseBrowser().from('mercado').select('*').eq('carta_id', cartaId).order('precio_pen').order('creada');
  if (error) throw new Error(error.message);
  return ((data || []) as Oferta[]).map(o => ({ ...o, precio_pen: Number(o.precio_pen), precio_mercado_pen: o.precio_mercado_pen == null ? null : Number(o.precio_mercado_pen) }));
}

/** Línea de mi carrito (función `mi_carrito`): la reserva más los datos públicos de la publicación. */
export type LineaCarrito = {
  id: string; publicacion_id: string; cantidad: number; precio_pen: number; creada: string; expira: string;
  carta_id: string; acabado: string; idioma: string; condicion: string; fotos: string[]; vendedor: string; vendedor_id: string;
  estado_publicacion: string; precio_actual: number; disponibles: number;
};

export async function miCarrito(): Promise<LineaCarrito[]> {
  const { data, error } = await supabaseBrowser().rpc('mi_carrito');
  if (error) throw new Error(error.message);
  return ((data || []) as LineaCarrito[]).map(l => ({ ...l, precio_pen: Number(l.precio_pen), precio_actual: Number(l.precio_actual) }));
}

export type ResultadoReserva = { ok: boolean; error?: string; reserva_id?: string; cantidad?: number; precio_pen?: number; expira?: string; disponibles?: number };

export async function reservarCopia(publicacionId: string, cantidad = 1): Promise<ResultadoReserva> {
  const { data, error } = await supabaseBrowser().rpc('reservar_copia', { p_publicacion: publicacionId, p_cantidad: cantidad });
  if (error) return { ok: false, error: error.message };
  return data as ResultadoReserva;
}

export async function liberarReserva(reservaId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseBrowser().rpc('liberar_reserva', { p_reserva: reservaId });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}


/** Mejoras 1 · D: destacados del Inicio del Mercado (función `mercado_destacados`). */
export type Destacada = { carta_id: string; desde: number; hasta?: number; copias: number; ofertas: number; vendidas?: number; deseadas?: number; motivo?: 'vendida' | 'deseada' | 'publicada' };
export type Destacados = { mas_vendidas: Destacada[]; mayor_precio: Destacada[]; generado: string };
export async function destacadosMercado(limite = 12): Promise<Destacados> {
  const { data, error } = await supabaseBrowser().rpc('mercado_destacados', { p_limite: limite });
  // Ajustes de layout · 1: si la función no está en la base (o falla), los carruseles se arman desde la vista
  // pública `mercado` (las más caras y las más publicadas) para no mostrar "no hay cartas" con publicaciones activas.
  if (error) return destacadosDeRespaldo(limite);
  const d = (data || { mas_vendidas: [], mayor_precio: [], generado: '' }) as Destacados;
  const n = (x: Destacada): Destacada => ({ ...x, desde: Number(x.desde), hasta: x.hasta == null ? undefined : Number(x.hasta), copias: Number(x.copias), ofertas: Number(x.ofertas), vendidas: Number(x.vendidas || 0), deseadas: Number(x.deseadas || 0) });
  return { ...d, mas_vendidas: (d.mas_vendidas || []).map(n), mayor_precio: (d.mayor_precio || []).map(n) };
}

/** Respaldo sin la función `mercado_destacados`: resumen por carta de la vista `mercado` + ventas públicas de 30 días. */
async function destacadosDeRespaldo(limite: number): Promise<Destacados> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from('mercado').select('carta_id, precio_pen, disponibles, creada');
  if (error) throw new Error(error.message);
  const porCarta = new Map<string, Destacada>();
  for (const o of (data || []) as { carta_id: string; precio_pen: number; disponibles: number }[]) {
    const d = porCarta.get(o.carta_id) || { carta_id: o.carta_id, desde: Infinity, hasta: 0, copias: 0, ofertas: 0, vendidas: 0, deseadas: 0, motivo: 'publicada' as const };
    d.desde = Math.min(d.desde, Number(o.precio_pen)); d.hasta = Math.max(d.hasta || 0, Number(o.precio_pen)); d.copias += Number(o.disponibles); d.ofertas += 1;
    porCarta.set(o.carta_id, d);
  }
  try {
    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: ventas } = await sb.from('ventas_publicas').select('carta_id, cantidad').gte('entregada_en', desde);
    for (const v of (ventas || []) as { carta_id: string; cantidad: number }[]) { const d = porCarta.get(v.carta_id); if (d) { d.vendidas = (d.vendidas || 0) + Number(v.cantidad); d.motivo = 'vendida'; } }
  } catch { /* sin ventas públicas: se ordena por copias */ }
  const todas = [...porCarta.values()];
  return {
    mas_vendidas: todas.slice().sort((a, b) => (b.vendidas || 0) - (a.vendidas || 0) || b.ofertas - a.ofertas || b.copias - a.copias).slice(0, limite),
    mayor_precio: todas.slice().sort((a, b) => (b.hasta || 0) - (a.hasta || 0) || b.desde - a.desde).slice(0, limite),
    generado: new Date().toISOString()
  };
}
