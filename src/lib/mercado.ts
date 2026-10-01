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

/** Resumen por carta (función `mercado_resumen`). */
export type ResumenCarta = { carta_id: string; copias: number; precio_min: number; precio_max: number; vendedores: string[]; ofertas: number; ultima: string };

export type OrdenMercado = 'novedad' | 'precio' | 'valor';
export type FiltrosMercado = { cartas?: string[] | null; set?: string; idioma?: string; acabado?: string; condicion?: string; min?: number | null; max?: number | null; orden?: OrdenMercado; limite?: number; desde?: number };


export async function resumenMercado(f: FiltrosMercado = {}): Promise<ResumenCarta[]> {
  const { data, error } = await supabaseBrowser().rpc('mercado_resumen', {
    p_cartas: f.cartas && f.cartas.length ? f.cartas : null, p_set: f.set || '', p_idioma: f.idioma || '', p_acabado: f.acabado || '', p_condicion: f.condicion || '',
    p_min: f.min ?? null, p_max: f.max ?? null, p_orden: f.orden || 'novedad', p_limite: f.limite ?? 60, p_desde: f.desde ?? 0
  });
  if (error) throw new Error(error.message);
  return ((data || []) as ResumenCarta[]).map(r => ({ ...r, copias: Number(r.copias), precio_min: Number(r.precio_min), precio_max: Number(r.precio_max), ofertas: Number(r.ofertas) }));
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
  if (error) throw new Error(error.message);
  const d = (data || { mas_vendidas: [], mayor_precio: [], generado: '' }) as Destacados;
  const n = (x: Destacada): Destacada => ({ ...x, desde: Number(x.desde), hasta: x.hasta == null ? undefined : Number(x.hasta), copias: Number(x.copias), ofertas: Number(x.ofertas), vendidas: Number(x.vendidas || 0), deseadas: Number(x.deseadas || 0) });
  return { ...d, mas_vendidas: (d.mas_vendidas || []).map(n), mayor_precio: (d.mayor_precio || []).map(n) };
}
