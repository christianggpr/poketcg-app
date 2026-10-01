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
