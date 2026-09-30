// Fase 3 · C: pagos a vendedores (retiros) y Excel del día de pago. Solo servidor.
import ExcelJS from 'exceljs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerDatosCobroVarios, type DatosCobro } from './cobro-servidor';
import { enviarCorreo } from './correo';
import { ADMIN_EMAIL, APP_NAME, appUrl } from './config';

export type Retiro = { id: string; numero: number; usuario_id: string; monto: number; bruto: number; comision: number; ordenes: string[]; estado: 'pendiente' | 'sin_datos' | 'pagado' | 'anulado'; n_operacion: string | null; comprobante_url: string | null; excel_generado_en: string | null; pagado_en: string | null; notas: string | null; creado: string; actualizado: string };
export type RetiroCompleto = Retiro & { perfil: { username: string; nombres: string; apellidos: string; dni: string | null; telefono: string | null; email: string } | null; cobro: DatosCobro | null; ordenes_numeros: number[] };

/** Retiros con perfil, datos de cobro (descifrados) y números de orden. */
export async function retirosCompletos(admin: SupabaseClient, estados: string[], limite = 500): Promise<RetiroCompleto[]> {
  const { data, error } = await admin.from('retiros').select('*').in('estado', estados).order('creado', { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  const filas = ((data || []) as Retiro[]).map(r => ({ ...r, monto: Number(r.monto), bruto: Number(r.bruto), comision: Number(r.comision), numero: Number(r.numero) }));
  const ids = [...new Set(filas.map(r => r.usuario_id))];
  const idsOrdenes = [...new Set(filas.flatMap(r => r.ordenes || []))];
  const [{ data: perfiles }, cobros, { data: ordenes }] = await Promise.all([
    ids.length ? admin.from('perfiles').select('id, username, nombres, apellidos, dni, telefono, email').in('id', ids) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    leerDatosCobroVarios(admin, ids),
    idsOrdenes.length ? admin.from('ordenes').select('id, numero').in('id', idsOrdenes) : Promise.resolve({ data: [] as Record<string, unknown>[] })
  ]);
  const perfil = new Map((perfiles || []).map(p => [p.id as string, p as RetiroCompleto['perfil']]));
  const numOrden = new Map((ordenes || []).map(o => [o.id as string, Number(o.numero)]));
  return filas.map(r => ({ ...r, perfil: perfil.get(r.usuario_id) || null, cobro: cobros.get(r.usuario_id) || null, ordenes_numeros: (r.ordenes || []).map(id => numOrden.get(id) || 0).filter(Boolean) }));
}

const ETIQUETA_METODO: Record<string, string> = { yape: 'Yape', plin: 'Plin', banco: 'Banco' };

/** Excel del día de pago: una hoja Yape/Plin, una de transferencias, una de "sin datos" y un resumen. */
export async function generarExcelRetiros(admin: SupabaseClient, fecha = new Date()): Promise<{ buffer: Buffer; nombre: string; retiros: RetiroCompleto[]; total: number }> {
  const retiros = await retirosCompletos(admin, ['pendiente', 'sin_datos']);
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  const cab = ['N.º retiro', 'Fecha', 'Usuario', 'Nombres y apellidos', 'DNI', 'Celular', 'Método', 'N.º Yape/Plin', 'Banco', 'N.º de cuenta', 'CCI', 'Titular', 'Órdenes incluidas', 'Monto bruto (S/)', 'Comisión (S/)', 'Monto a depositar (S/)', 'Estado', 'N.º de operación del depósito'];
  const fila = (r: RetiroCompleto) => [r.numero, new Date(r.creado).toLocaleDateString('es-PE'), '@' + (r.perfil?.username || ''), `${r.perfil?.nombres || ''} ${r.perfil?.apellidos || ''}`.trim(), r.perfil?.dni || '', r.perfil?.telefono || '', r.cobro ? ETIQUETA_METODO[r.cobro.metodo] : 'SIN DATOS', r.cobro && r.cobro.metodo !== 'banco' ? r.cobro.numero : '', r.cobro?.banco || '', r.cobro?.cuenta || '', r.cobro?.cci || '', r.cobro?.titular || '', r.ordenes_numeros.map(n => '#' + n).join(', '), r.bruto, r.comision, r.monto, r.estado === 'sin_datos' ? 'sin datos de cobro' : 'pendiente', ''];
  const hoja = (nombre: string, lista: RetiroCompleto[]) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow(cab).font = { bold: true };
    for (const r of lista) ws.addRow(fila(r));
    ws.columns.forEach((c, i) => { c.width = i === 3 || i === 12 ? 32 : 16; });
    (['N', 'O', 'P'] as const).forEach(col => { ws.getColumn(col).numFmt = '#,##0.00'; });
    if (lista.length) ws.addRow(['', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL', lista.reduce((s, r) => s + r.bruto, 0), lista.reduce((s, r) => s + r.comision, 0), lista.reduce((s, r) => s + r.monto, 0), '', '']).font = { bold: true };
    return ws;
  };
  const yape = retiros.filter(r => r.cobro && r.cobro.metodo !== 'banco');
  const banco = retiros.filter(r => r.cobro && r.cobro.metodo === 'banco');
  const sinDatos = retiros.filter(r => !r.cobro);
  hoja('Yape-Plin', yape);
  hoja('Transferencia', banco);
  hoja('Sin datos de cobro', sinDatos);
  const res = wb.addWorksheet('Resumen');
  const total = retiros.filter(r => r.cobro).reduce((s, r) => s + r.monto, 0);
  res.addRows([
    ['Fecha de pago', fecha.toLocaleDateString('es-PE')],
    ['Total a pagar (S/)', total],
    ['Total comisiones (S/)', retiros.reduce((s, r) => s + r.comision, 0)],
    ['Vendedores por pagar', new Set(retiros.filter(r => r.cobro).map(r => r.usuario_id)).size],
    ['Pagos por Yape/Plin', yape.length],
    ['Transferencias', banco.length],
    ['Vendedores sin datos de cobro', sinDatos.length]
  ]);
  res.getColumn(1).width = 32; res.getColumn(2).width = 18;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const nombre = `pagos-poketcg-${fecha.toISOString().slice(0, 10)}.xlsx`;
  return { buffer, nombre, retiros, total: Math.round(total * 100) / 100 };
}

/** Día de pago: genera el Excel, lo envía al administrador y deja registro. */
export async function procesarDiaDePago(admin: SupabaseClient, fecha = new Date()): Promise<{ generado: boolean; retiros: number; total: number; correo?: string }> {
  const { buffer, nombre, retiros, total } = await generarExcelRetiros(admin, fecha);
  const pendientes = retiros.filter(r => r.estado === 'pendiente' && !r.excel_generado_en);
  if (!retiros.length) return { generado: false, retiros: 0, total: 0 };
  const r = await enviarCorreo({
    para: ADMIN_EMAIL,
    asunto: `Pagos a vendedores del ${fecha.toLocaleDateString('es-PE')}: ${retiros.filter(x => x.cobro).length} por S/ ${total.toFixed(2)}`,
    html: `<p>Adjunto el Excel de pagos del día. Total a depositar: <b>S/ ${total.toFixed(2)}</b> (${retiros.filter(x => x.cobro).length} pagos; ${retiros.filter(x => !x.cobro).length} vendedores sin datos de cobro).</p><p>Después de pagar, marca cada retiro como pagado en <a href="${appUrl()}/admin?tab=retiros">${appUrl()}/admin?tab=retiros</a>.</p>`,
    texto: `Excel de pagos adjunto. Total a depositar: S/ ${total.toFixed(2)}. Marca los pagos en ${appUrl()}/admin?tab=retiros`,
    adjuntos: [{ filename: nombre, content: buffer.toString('base64') }]
  });
  if (pendientes.length) await admin.from('retiros').update({ excel_generado_en: fecha.toISOString() }).in('id', pendientes.map(p => p.id));
  try { await admin.rpc('notificar_admins', { p_tipo: 'excel_pagos', p_titulo: `Excel de pagos listo: S/ ${total.toFixed(2)}`, p_cuerpo: `${retiros.filter(x => x.cobro).length} pagos a vendedores${retiros.filter(x => !x.cobro).length ? ` · ${retiros.filter(x => !x.cobro).length} sin datos de cobro` : ''}. Descárgalo en Admin → Retiros y márcalos como pagados.`, p_enlace: '/admin?tab=retiros', p_datos: {} }); } catch { /* aviso opcional */ }
  return { generado: true, retiros: retiros.length, total, correo: r.ok ? 'enviado' : r.error };
}
