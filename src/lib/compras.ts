// Fase 3 · compras: pago por Yape con voucher, órdenes por vendedor, tiendas y notificaciones (lado cliente).
import { comprimirImagen } from './fotos';
import { supabaseBrowser } from './supabase/client';

export type Tienda = { id: string; nombre: string; distrito: string; direccion: string; referencia: string; horario: string; dias_abierto: number[]; telefono: string | null; activa: boolean; creada: string; actualizada: string };
export type EstadoPago = 'pendiente' | 'revision' | 'confirmado' | 'rechazado' | 'vencido' | 'cancelado';
export type EstadoOrden = 'reservada' | 'revision' | 'pago_confirmado' | 'en_tienda' | 'entregada' | 'saldo_liberado' | 'pago_rechazado' | 'cancelada' | 'vencida' | 'disputa';
export type Pago = { id: string; numero: number; comprador_id: string; tienda_id: string | null; monto: number; estado: EstadoPago; voucher_url: string | null; n_operacion: string | null; motivo: string | null; expira: string; comprobante_en: string | null; revisado_en: string | null; creado: string; actualizado: string };
export type Orden = { id: string; numero: number; pago_id: string; comprador_id: string; vendedor_id: string; tienda_id: string | null; estado: EstadoOrden; subtotal: number; comision: number; neto_vendedor: number; codigo_retiro: string | null; pago_confirmado_en: string | null; fecha_limite: string | null; fecha_entrega: string | null; en_tienda_en: string | null; foto_entrega_url: string | null; entregada_en: string | null; entregada_por: string | null; saldo_liberado_en: string | null; motivo: string | null; creada: string; actualizada: string };
export type OrdenItem = { id: string; orden_id: string; publicacion_id: string | null; reserva_id: string | null; entrada_id: string | null; vendedor_id: string; carta_id: string; cantidad: number; precio_pen: number; acabado: string; idioma: string; condicion: string; entrada_datos?: Record<string, unknown> | null; descontado_en?: string | null; entrada_comprador_id?: string | null };
export type Notificacion = { id: number; usuario_id: string; tipo: string; titulo: string; cuerpo: string; enlace: string | null; datos: Record<string, unknown>; canales: string[]; leida_en: string | null; enviada_en: string | null; creada: string };

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export const ETIQUETA_PAGO: Record<EstadoPago, string> = { pendiente: 'Esperando tu comprobante', revision: 'Pago en revisión', confirmado: 'Pago confirmado', rechazado: 'Pago rechazado', vencido: 'Reserva vencida', cancelado: 'Cancelada' };
export const ETIQUETA_ORDEN: Record<EstadoOrden, string> = { reservada: 'Reservada (esperando pago)', revision: 'Pago en revisión', pago_confirmado: 'Pago confirmado · en camino a la tienda', en_tienda: 'En la tienda · lista para recoger', entregada: 'Entregada', saldo_liberado: 'Entregada · saldo liberado', pago_rechazado: 'Pago rechazado', cancelada: 'Cancelada', vencida: 'Vencida (no se entregó a tiempo)', disputa: 'En disputa' };

const num = <T extends Record<string, unknown>>(o: T, claves: (keyof T)[]): T => { const c = { ...o }; for (const k of claves) if (c[k] != null) (c as Record<string, unknown>)[k as string] = Number(c[k]); return c; };
const nPago = (p: Pago) => num(p, ['monto', 'numero']);
const nOrden = (o: Orden) => num(o, ['subtotal', 'comision', 'neto_vendedor', 'numero']);
const nItem = (i: OrdenItem) => num(i, ['precio_pen', 'cantidad']);

export async function tiendasActivas(): Promise<Tienda[]> {
  const { data, error } = await supabaseBrowser().from('tiendas').select('*').eq('activa', true).order('nombre');
  if (error) throw new Error(error.message);
  return (data || []) as Tienda[];
}

export type ResultadoCompra = { ok: boolean; error?: string; pago_id?: string; monto?: number; expira?: string; ordenes?: number; yape_numero?: string; yape_nombre?: string };
export async function crearPago(tiendaId: string): Promise<ResultadoCompra> {
  const { data, error } = await supabaseBrowser().rpc('crear_pago', { p_tienda: tiendaId });
  if (error) return { ok: false, error: error.message };
  return data as ResultadoCompra;
}
export async function cancelarPago(pagoId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseBrowser().rpc('cancelar_pago', { p_pago: pagoId });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

/** Sube la foto del voucher (comprimida) al bucket privado y registra el número de operación. */
export async function subirComprobante(usuarioId: string, pagoId: string, file: File, nOperacion: string): Promise<{ ok: boolean; error?: string; duplicado?: boolean }> {
  const sb = supabaseBrowser();
  const blob = await comprimirImagen(file, 1600, 0.85);
  const ruta = `${usuarioId}/${pagoId}-${Date.now().toString(36)}.jpg`;
  const { error } = await sb.storage.from('comprobantes').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) return { ok: false, error: 'No se pudo subir la foto: ' + error.message };
  const { data, error: e2 } = await sb.rpc('subir_comprobante', { p_pago: pagoId, p_url: 'comprobantes/' + ruta, p_operacion: nOperacion });
  if (e2) return { ok: false, error: e2.message };
  const r = data as { ok: boolean; error?: string; duplicado?: boolean };
  if (r.ok) fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => {});   // el correo al administrador
  return r;
}

/** URL firmada (1 h) de mi propio voucher. */
export async function urlVoucher(voucherUrl: string | null): Promise<string | null> {
  if (!voucherUrl) return null;
  const { data } = await supabaseBrowser().storage.from('comprobantes').createSignedUrl(voucherUrl.replace(/^comprobantes\//, ''), 3600);
  return data?.signedUrl || null;
}

export async function misPagos(): Promise<Pago[]> {
  const { data, error } = await supabaseBrowser().from('pagos').select('*').order('creado', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data || []) as Pago[]).map(nPago);
}

export async function pagoDetalle(pagoId: string): Promise<{ pago: Pago; ordenes: Orden[]; items: OrdenItem[]; tienda: Tienda | null } | null> {
  const sb = supabaseBrowser();
  const { data: pago } = await sb.from('pagos').select('*').eq('id', pagoId).maybeSingle();
  if (!pago) return null;
  const [{ data: ordenes }, { data: tienda }] = await Promise.all([
    sb.from('ordenes').select('*').eq('pago_id', pagoId).order('numero'),
    (pago as Pago).tienda_id ? sb.from('tiendas').select('*').eq('id', (pago as Pago).tienda_id as string).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const ids = (ordenes || []).map(o => o.id as string);
  const { data: items } = ids.length ? await sb.from('orden_items').select('*').in('orden_id', ids) : { data: [] };
  return { pago: nPago(pago as Pago), ordenes: ((ordenes || []) as Orden[]).map(nOrden), items: ((items || []) as OrdenItem[]).map(nItem), tienda: (tienda as Tienda | null) || null };
}

/** Órdenes en las que vendo (Mis ventas → Órdenes) o compro, con sus ítems. */
export async function ordenesDe(campo: 'vendedor_id' | 'comprador_id', usuarioId: string): Promise<{ ordenes: Orden[]; items: OrdenItem[]; tiendas: Map<string, Tienda> }> {
  const sb = supabaseBrowser();
  const { data: ordenes, error } = await sb.from('ordenes').select('*').eq(campo, usuarioId).order('creada', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const ids = (ordenes || []).map(o => o.id as string);
  const idsT = [...new Set((ordenes || []).map(o => o.tienda_id as string).filter(Boolean))];
  const [{ data: items }, { data: tiendas }] = await Promise.all([
    ids.length ? sb.from('orden_items').select('*').in('orden_id', ids) : Promise.resolve({ data: [] }),
    idsT.length ? sb.from('tiendas').select('*').in('id', idsT) : Promise.resolve({ data: [] })
  ]);
  return { ordenes: ((ordenes || []) as Orden[]).map(nOrden), items: ((items || []) as OrdenItem[]).map(nItem), tiendas: new Map(((tiendas || []) as Tienda[]).map(t => [t.id, t])) };
}

export async function usernamesDe(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data } = await supabaseBrowser().from('perfiles_publicos').select('id, username').in('id', unicos);
  return new Map(((data || []) as { id: string; username: string }[]).map(p => [p.id, p.username]));
}

export const fechaCorta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const fechaHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
/** Fecha AAAA-MM-DD como texto local (sin desfase de zona horaria). */
export const fechaDia = (d: string | null | undefined) => { if (!d) return '—'; const [a, m, dd] = d.split('-'); return `${dd}/${m}/${a}`; };
