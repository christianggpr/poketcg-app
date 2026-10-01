// Fase 4 · C: reportes del administrador (ventas y comisiones por período) y su Excel. Solo servidor.
import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Grupo = 'dia' | 'semana' | 'mes';
export type FilaSerie = { periodo: string; ordenes: number; ventas: number; comisiones: number; neto: number; compradores: number; vendedores: number; devoluciones: number; monto_devuelto: number };
export type Reporte = {
  desde: string; hasta: string; grupo: Grupo;
  serie: FilaSerie[];
  totales: { ordenes: number; ventas: number; comisiones: number; neto: number; unidades: number; compradores: number; vendedores: number; devoluciones: number; monto_devuelto: number; ticket: number; usuarios_nuevos: number; usuarios_total: number; publicaciones_activas: number; pagado_vendedores: number };
  vendedores: { id: string; username: string; ordenes: number; monto: number; comision: number; puntaje: string | null; faltas: string | null }[];
  compradores: { id: string; username: string; ordenes: number; monto: number }[];
  cartas: { carta_id: string; nombre: string; unidades: number; monto: number }[];
  estados: Record<string, number>;
  reclamos: { abiertos: number; periodo: number };
};
export type FilaOrden = { numero: number; entregada_en: string; comprador: string; vendedor: string; tienda: string | null; cartas: string; unidades: number; subtotal: number; comision: number; neto_vendedor: number; entregada_por: string; estado: string };

/** Rango por defecto: los últimos 30 días (fechas de Lima). */
export function rangoPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date(Date.now() - 5 * 3600 * 1000);
  const hasta = hoy.toISOString().slice(0, 10);
  const desde = new Date(hoy.getTime() - 29 * 86400 * 1000).toISOString().slice(0, 10);
  return { desde, hasta };
}
export const fechaValida = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const n = (v: unknown) => Number(v || 0);
/** Llama a reporte_ventas con la sesión del administrador (la función exige es_admin()). */
export async function reporteVentas(supabase: SupabaseClient, desde: string, hasta: string, grupo: Grupo): Promise<Reporte> {
  const { data, error } = await supabase.rpc('reporte_ventas', { p_desde: desde, p_hasta: hasta, p_grupo: grupo });
  if (error) throw new Error(error.message);
  const r = data as Reporte;
  return {
    ...r,
    serie: (r.serie || []).map(f => ({ ...f, ordenes: n(f.ordenes), ventas: n(f.ventas), comisiones: n(f.comisiones), neto: n(f.neto), compradores: n(f.compradores), vendedores: n(f.vendedores), devoluciones: n(f.devoluciones), monto_devuelto: n(f.monto_devuelto) })),
    totales: Object.fromEntries(Object.entries(r.totales || {}).map(([k, v]) => [k, n(v)])) as Reporte['totales'],
    vendedores: (r.vendedores || []).map(v => ({ ...v, ordenes: n(v.ordenes), monto: n(v.monto), comision: n(v.comision) })),
    compradores: (r.compradores || []).map(v => ({ ...v, ordenes: n(v.ordenes), monto: n(v.monto) })),
    cartas: (r.cartas || []).map(c => ({ ...c, unidades: n(c.unidades), monto: n(c.monto) })),
    estados: Object.fromEntries(Object.entries(r.estados || {}).map(([k, v]) => [k, n(v)])),
    reclamos: { abiertos: n(r.reclamos?.abiertos), periodo: n(r.reclamos?.periodo) }
  };
}

export async function reporteOrdenes(supabase: SupabaseClient, desde: string, hasta: string): Promise<FilaOrden[]> {
  const { data, error } = await supabase.rpc('reporte_ordenes', { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  return ((data || []) as FilaOrden[]).map(f => ({ ...f, numero: n(f.numero), unidades: n(f.unidades), subtotal: n(f.subtotal), comision: n(f.comision), neto_vendedor: n(f.neto_vendedor) }));
}

const ETIQUETA_GRUPO: Record<Grupo, string> = { dia: 'Día', semana: 'Semana (desde el lunes)', mes: 'Mes' };
const ESTADOS: Record<string, string> = { reservada: 'Reservada', revision: 'Pago en revisión', pago_confirmado: 'Pago confirmado', en_tienda: 'En tienda', entregada: 'Entregada', saldo_liberado: 'Entregada (saldo liberado)', pago_rechazado: 'Pago rechazado', cancelada: 'Cancelada', vencida: 'Vencida', disputa: 'En disputa' };

/** Excel del reporte: Resumen, Por período, Vendedores, Compradores, Cartas y Órdenes. */
export async function generarExcelReporte(supabase: SupabaseClient, desde: string, hasta: string, grupo: Grupo): Promise<{ buffer: Buffer; nombre: string }> {
  const [r, ordenes] = await Promise.all([reporteVentas(supabase, desde, hasta, grupo), reporteOrdenes(supabase, desde, hasta)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PokéTCG';
  const dinero = '"S/ "#,##0.00';
  const encabezado = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };

  const res = wb.addWorksheet('Resumen');
  res.columns = [{ header: 'Concepto', key: 'c', width: 38 }, { header: 'Valor', key: 'v', width: 18 }];
  const t = r.totales;
  const filas: [string, number | string][] = [
    ['Período', `${desde} a ${hasta}`], ['Órdenes entregadas', t.ordenes], ['Unidades vendidas', t.unidades], ['Ventas (S/)', t.ventas], ['Comisiones PokéTCG (S/)', t.comisiones], ['Neto a vendedores (S/)', t.neto],
    ['Ticket promedio (S/)', t.ticket], ['Compradores distintos', t.compradores], ['Vendedores distintos', t.vendedores], ['Devoluciones (órdenes vencidas o anuladas por reclamo)', t.devoluciones], ['Monto devuelto (S/)', t.monto_devuelto],
    ['Pagado a vendedores en el período (S/)', t.pagado_vendedores], ['Reclamos abiertos hoy', r.reclamos.abiertos], ['Reclamos del período', r.reclamos.periodo], ['Usuarios nuevos', t.usuarios_nuevos], ['Usuarios en total', t.usuarios_total], ['Publicaciones activas hoy', t.publicaciones_activas]
  ];
  for (const [c, v] of filas) { const row = res.addRow({ c, v }); if (/\(S\/\)/.test(c)) row.getCell(2).numFmt = dinero; }
  res.addRow({});
  res.addRow({ c: 'Órdenes por estado (hoy)' }).font = { bold: true };
  for (const [k, v] of Object.entries(r.estados)) res.addRow({ c: ESTADOS[k] || k, v });
  encabezado(res);

  const per = wb.addWorksheet('Por período');
  per.columns = [{ header: ETIQUETA_GRUPO[grupo], key: 'periodo', width: 14 }, { header: 'Órdenes', key: 'ordenes', width: 10 }, { header: 'Ventas (S/)', key: 'ventas', width: 14 }, { header: 'Comisiones (S/)', key: 'comisiones', width: 16 }, { header: 'Neto vendedores (S/)', key: 'neto', width: 20 }, { header: 'Compradores', key: 'compradores', width: 12 }, { header: 'Vendedores', key: 'vendedores', width: 12 }, { header: 'Devoluciones', key: 'devoluciones', width: 13 }, { header: 'Monto devuelto (S/)', key: 'monto_devuelto', width: 18 }];
  for (const f of r.serie) per.addRow(f);
  for (const k of ['ventas', 'comisiones', 'neto', 'monto_devuelto']) per.getColumn(k).numFmt = dinero;
  encabezado(per);

  const ven = wb.addWorksheet('Vendedores');
  ven.columns = [{ header: 'Vendedor', key: 'username', width: 22 }, { header: 'Órdenes', key: 'ordenes', width: 10 }, { header: 'Ventas (S/)', key: 'monto', width: 14 }, { header: 'Comisión (S/)', key: 'comision', width: 14 }, { header: 'Puntaje', key: 'puntaje', width: 10 }, { header: 'Faltas (90 días)', key: 'faltas', width: 14 }];
  for (const v of r.vendedores) ven.addRow({ ...v, username: '@' + v.username });
  ven.getColumn('monto').numFmt = dinero; ven.getColumn('comision').numFmt = dinero; encabezado(ven);

  const com = wb.addWorksheet('Compradores');
  com.columns = [{ header: 'Comprador', key: 'username', width: 22 }, { header: 'Órdenes', key: 'ordenes', width: 10 }, { header: 'Compras (S/)', key: 'monto', width: 14 }];
  for (const v of r.compradores) com.addRow({ ...v, username: '@' + v.username });
  com.getColumn('monto').numFmt = dinero; encabezado(com);

  const car = wb.addWorksheet('Cartas');
  car.columns = [{ header: 'Carta', key: 'nombre', width: 36 }, { header: 'Id', key: 'carta_id', width: 16 }, { header: 'Unidades', key: 'unidades', width: 10 }, { header: 'Ventas (S/)', key: 'monto', width: 14 }];
  for (const c of r.cartas) car.addRow(c);
  car.getColumn('monto').numFmt = dinero; encabezado(car);

  const ord = wb.addWorksheet('Órdenes');
  ord.columns = [{ header: 'N.º orden', key: 'numero', width: 10 }, { header: 'Entregada', key: 'entregada_en', width: 20 }, { header: 'Comprador', key: 'comprador', width: 18 }, { header: 'Vendedor', key: 'vendedor', width: 18 }, { header: 'Tienda', key: 'tienda', width: 20 }, { header: 'Cartas', key: 'cartas', width: 50 }, { header: 'Unidades', key: 'unidades', width: 10 }, { header: 'Subtotal (S/)', key: 'subtotal', width: 14 }, { header: 'Comisión (S/)', key: 'comision', width: 14 }, { header: 'Neto vendedor (S/)', key: 'neto_vendedor', width: 18 }, { header: 'Entregada por', key: 'entregada_por', width: 14 }, { header: 'Estado', key: 'estado', width: 22 }];
  for (const o of ordenes) ord.addRow({ ...o, entregada_en: new Date(o.entregada_en).toLocaleString('es-PE', { timeZone: 'America/Lima' }), comprador: '@' + o.comprador, vendedor: '@' + o.vendedor, estado: ESTADOS[o.estado] || o.estado });
  for (const k of ['subtotal', 'comision', 'neto_vendedor']) ord.getColumn(k).numFmt = dinero;
  encabezado(ord);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, nombre: `reporte-poketcg-${desde}-a-${hasta}.xlsx` };
}
