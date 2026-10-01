// Datos para las páginas públicas (sin iniciar sesión): perfil de vendedor, reseñas y ofertas con nombres de carta.
// Usa la clave anon en el servidor: solo ve lo que las vistas públicas permiten.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Reputacion } from './coleccion';

export type VendedorPub = { id: string; username: string; reputacion: Reputacion | null; estado: 'activo' | 'suspendido'; creado_en: string };
export type ResenaPub = { id: string; puntaje: number; comentario: string; respuesta: string | null; creada: string; comprador: string; orden_numero: number };
export type OfertaPub = { id: string; carta_id: string; nombre: string; coleccion: string; numero: string; total: string; imagen: string | null; precio_pen: number; disponibles: number; acabado: string; idioma: string; condicion: string; fotos: string[]; vendedor: string; vendedor_id: string; creada: string };

export function supabasePublico(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

type CartaFila = { id: string; numero: string; nombre: string; nombre_es: string | null; ptcgio_id: string | null; coleccion_id: string; sin_datos: boolean };
type ColFila = { id: string; nombre: string; nombre_es: string | null; abreviatura: string | null; total_impreso: number | null; serie_id: string | null; tcgdex_id: string | null; region: string };

/** Imagen pequeña de una carta a partir de los datos de la base (pokemontcg.io o TCGdex). */
export function imagenCarta(c: CartaFila, s: ColFila | undefined): string | null {
  if (!s || c.sin_datos) return null;
  if (s.region === 'ja') {
    if (s.tcgdex_id && s.serie_id) return `https://assets.tcgdex.net/ja/${s.serie_id.toLowerCase()}/${s.tcgdex_id}/${c.numero}/low.webp`;
    return null;
  }
  if (c.ptcgio_id) { const i = c.ptcgio_id.indexOf('-'); return `https://images.pokemontcg.io/${c.ptcgio_id.slice(0, i)}/${c.ptcgio_id.slice(i + 1)}.png`; }
  if (s.serie_id) return `https://assets.tcgdex.net/en/${s.serie_id}/${s.tcgdex_id || s.id}/${c.numero}/low.webp`;
  return null;
}

/** Nombres, colección e imagen de un conjunto de cartas (por id). */
export async function cartasPublicas(sb: SupabaseClient, ids: string[]): Promise<Map<string, { nombre: string; coleccion: string; numero: string; total: string; imagen: string | null }>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const { data: cartas } = await sb.from('cartas').select('id, numero, nombre, nombre_es, ptcgio_id, coleccion_id, sin_datos').in('id', unicos);
  const cols = [...new Set(((cartas || []) as CartaFila[]).map(c => c.coleccion_id))];
  const { data: colecciones } = cols.length ? await sb.from('colecciones_tcg').select('id, nombre, nombre_es, abreviatura, total_impreso, serie_id, tcgdex_id, region').in('id', cols) : { data: [] };
  const porCol = new Map(((colecciones || []) as ColFila[]).map(c => [c.id, c]));
  return new Map(((cartas || []) as CartaFila[]).map(c => {
    const s = porCol.get(c.coleccion_id);
    return [c.id, { nombre: c.nombre_es || c.nombre, coleccion: s ? (s.nombre_es || s.nombre) : c.coleccion_id, numero: c.numero, total: s?.total_impreso ? `/${s.total_impreso}` : '', imagen: imagenCarta(c, s) }];
  }));
}

export async function vendedorPublico(sb: SupabaseClient, username: string): Promise<VendedorPub | null> {
  const { data } = await sb.from('vendedores_publicos').select('*').eq('username', username.toLowerCase()).maybeSingle();
  return (data as VendedorPub) || null;
}

export async function resenasPublicas(sb: SupabaseClient, vendedorId: string, limite = 20): Promise<ResenaPub[]> {
  const { data } = await sb.from('resenas_publicas').select('id, puntaje, comentario, respuesta, creada, comprador, orden_numero').eq('vendedor_id', vendedorId).order('creada', { ascending: false }).limit(limite);
  return ((data || []) as ResenaPub[]).map(r => ({ ...r, puntaje: Number(r.puntaje), orden_numero: Number(r.orden_numero) }));
}

/** Ofertas activas (vista `mercado`) con nombre e imagen de la carta; filtradas por vendedor si se indica. */
export async function ofertasPublicas(sb: SupabaseClient, filtro: { vendedorId?: string; cartaId?: string; limite?: number }): Promise<OfertaPub[]> {
  let q = sb.from('mercado').select('id, carta_id, precio_pen, disponibles, acabado, idioma, condicion, fotos, vendedor, vendedor_id, creada').order('creada', { ascending: false }).limit(filtro.limite || 100);
  if (filtro.vendedorId) q = q.eq('vendedor_id', filtro.vendedorId);
  if (filtro.cartaId) q = q.eq('carta_id', filtro.cartaId);
  const { data } = await q;
  const filas = (data || []) as Omit<OfertaPub, 'nombre' | 'coleccion' | 'numero' | 'total' | 'imagen'>[];
  const info = await cartasPublicas(sb, filas.map(f => f.carta_id));
  return filas.map(f => { const c = info.get(f.carta_id); return { ...f, precio_pen: Number(f.precio_pen), disponibles: Number(f.disponibles), fotos: f.fotos || [], nombre: c?.nombre || f.carta_id, coleccion: c?.coleccion || '', numero: c?.numero || '', total: c?.total || '', imagen: c?.imagen || null }; });
}

// ---------------------------------------------------------------------------------------------
// Fase 4 · D: ficha pública de carta, historial de ventas, tiendas y cifras de la comunidad
// ---------------------------------------------------------------------------------------------
export type CartaPub = { id: string; nombre: string; nombre_en: string; nombre_es: string | null; nombre_ja: string | null; numero: string; total: string; rareza: string | null; categoria: string; tipos: string[]; hp: number | null; ilustrador: string | null; sin_datos: boolean; coleccion_id: string; coleccion: string; coleccion_en: string; abreviatura: string | null; fecha: string | null; region: string; imagen: string | null; imagen_grande: string | null };
export type VentaPub = { carta_id: string; cantidad: number; precio_pen: number; acabado: string; idioma: string; condicion: string; entregada_en: string; vendedor: string };
export type TiendaPub = { id: string; nombre: string; distrito: string; direccion: string; referencia: string; horario: string; dias_abierto: number[]; telefono: string | null; tarifa_recojo: number; mapa_url: string; lat: number | null; lon: number | null; instagram: string; creada: string };
export type Estadisticas = {
  usuarios: number; cartas_registradas: number; en_venta: number; publicaciones: number; vendidas: number; ventas: number; vendedores: number; tiendas: number;
  ultimas_ventas: { carta_id: string; precio_pen: number; condicion: string; idioma: string; acabado: string; entregada_en: string }[];
  recientes: { id: string; carta_id: string; precio_pen: number; condicion: string; idioma: string; acabado: string; vendedor: string; creada: string }[];
  mas_vendidas: { carta_id: string; unidades: number; desde: number; ultima: string }[];
  mas_deseadas: { carta_id: string; personas: number }[];
};

type CartaFilaCompleta = CartaFila & { nombre_ja: string | null; rareza: string | null; categoria: string; tipos: string[] | null; hp: number | null; ilustrador: string | null };
type ColFilaCompleta = ColFila & { fecha: string | null };

function imagenGrande(c: CartaFila, s: ColFila | undefined): string | null {
  if (!s || c.sin_datos) return null;
  if (s.region === 'ja') return s.tcgdex_id && s.serie_id ? `https://assets.tcgdex.net/ja/${s.serie_id.toLowerCase()}/${s.tcgdex_id}/${c.numero}/high.webp` : null;
  if (c.ptcgio_id) { const i = c.ptcgio_id.indexOf('-'); return `https://images.pokemontcg.io/${c.ptcgio_id.slice(0, i)}/${c.ptcgio_id.slice(i + 1)}_hires.png`; }
  if (s.serie_id) return `https://assets.tcgdex.net/en/${s.serie_id}/${s.tcgdex_id || s.id}/${c.numero}/high.webp`;
  return null;
}

/** Una carta del catálogo con su colección e imágenes (para la ficha pública). */
export async function cartaPublica(sb: SupabaseClient, id: string): Promise<CartaPub | null> {
  const { data: c } = await sb.from('cartas').select('id, numero, nombre, nombre_es, nombre_ja, ptcgio_id, coleccion_id, sin_datos, rareza, categoria, tipos, hp, ilustrador').eq('id', id).maybeSingle();
  if (!c) return null;
  const carta = c as CartaFilaCompleta;
  const { data: s } = await sb.from('colecciones_tcg').select('id, nombre, nombre_es, abreviatura, total_impreso, serie_id, tcgdex_id, region, fecha').eq('id', carta.coleccion_id).maybeSingle();
  const set = (s as ColFilaCompleta | null) || undefined;
  return {
    id: carta.id, nombre: carta.nombre_es || carta.nombre, nombre_en: carta.nombre, nombre_es: carta.nombre_es, nombre_ja: carta.nombre_ja, numero: carta.numero,
    total: set?.total_impreso ? `/${set.total_impreso}` : '', rareza: carta.rareza, categoria: carta.categoria, tipos: carta.tipos || [], hp: carta.hp, ilustrador: carta.ilustrador, sin_datos: carta.sin_datos,
    coleccion_id: carta.coleccion_id, coleccion: set ? (set.nombre_es || set.nombre) : carta.coleccion_id, coleccion_en: set?.nombre || '', abreviatura: set?.abreviatura || null, fecha: set?.fecha || null, region: set?.region || 'int',
    imagen: imagenCarta(carta, set), imagen_grande: imagenGrande(carta, set)
  };
}

/** Últimas ventas entregadas de una carta (vista `ventas_publicas`), más recientes primero. */
export async function ventasCarta(sb: SupabaseClient, cartaId: string, limite = 30): Promise<VentaPub[]> {
  const { data } = await sb.from('ventas_publicas').select('*').eq('carta_id', cartaId).order('entregada_en', { ascending: false }).limit(limite);
  return ((data || []) as VentaPub[]).map(v => ({ ...v, cantidad: Number(v.cantidad), precio_pen: Number(v.precio_pen) }));
}

/** Resumen de las ventas en PokéTCG: promedio ponderado por copia, mínimo, máximo y cuántas copias. */
export function resumenVentas(ventas: VentaPub[]): { copias: number; promedio: number; min: number; max: number; ultima: string | null } | null {
  if (!ventas.length) return null;
  const copias = ventas.reduce((n, v) => n + v.cantidad, 0);
  const total = ventas.reduce((n, v) => n + v.cantidad * v.precio_pen, 0);
  return { copias, promedio: Math.round((total / copias) * 100) / 100, min: Math.min(...ventas.map(v => v.precio_pen)), max: Math.max(...ventas.map(v => v.precio_pen)), ultima: ventas[0]?.entregada_en || null };
}

/** Vendedores públicos por id (reputación) para mostrar junto a cada oferta. */
export async function vendedoresPorId(sb: SupabaseClient, ids: string[]): Promise<Map<string, VendedorPub>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map();
  const { data } = await sb.from('vendedores_publicos').select('*').in('id', unicos);
  return new Map(((data || []) as VendedorPub[]).map(v => [v.id, v]));
}

export async function tiendasPublicas(sb: SupabaseClient): Promise<TiendaPub[]> {
  const { data } = await sb.from('tiendas_publicas').select('*').order('distrito').order('nombre');
  return ((data || []) as TiendaPub[]).map(t => ({ ...t, tarifa_recojo: Number(t.tarifa_recojo || 0), lat: t.lat == null ? null : Number(t.lat), lon: t.lon == null ? null : Number(t.lon), dias_abierto: t.dias_abierto || [] }));
}

export async function estadisticasPublicas(sb: SupabaseClient): Promise<Estadisticas | null> {
  const { data, error } = await sb.rpc('estadisticas_publicas');
  if (error || !data) return null;
  const e = data as Estadisticas;
  return { ...e, usuarios: Number(e.usuarios), cartas_registradas: Number(e.cartas_registradas), en_venta: Number(e.en_venta), publicaciones: Number(e.publicaciones), vendidas: Number(e.vendidas), ventas: Number(e.ventas), vendedores: Number(e.vendedores), tiendas: Number(e.tiendas),
    ultimas_ventas: (e.ultimas_ventas || []).map(v => ({ ...v, precio_pen: Number(v.precio_pen) })), recientes: (e.recientes || []).map(v => ({ ...v, precio_pen: Number(v.precio_pen) })),
    mas_vendidas: (e.mas_vendidas || []).map(v => ({ ...v, unidades: Number(v.unidades), desde: Number(v.desde) })), mas_deseadas: (e.mas_deseadas || []).map(v => ({ ...v, personas: Number(v.personas) })) };
}

export { enlaceMapa } from './tiendas-core';
