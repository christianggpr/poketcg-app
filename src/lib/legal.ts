// Datos vigentes para los textos legales (/terminos y /privacidad): comisión, plazos y días de pago
// salen de los ajustes del administrador; si la base no responde se usan los valores por defecto.
import { cargarAjustes } from './ajustes';
import { AJUSTES_POR_DEFECTO, PAGOS_POR_DEFECTO, type AjustesPagos } from './precios-core';
import { supabaseAdmin } from './supabase/admin';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export type DatosLegales = { comisionPct: number; pagos: AjustesPagos; diasPagoTexto: string };

export async function datosLegales(): Promise<DatosLegales> {
  let comision = AJUSTES_POR_DEFECTO.comision;
  let pagos: AjustesPagos = PAGOS_POR_DEFECTO;
  try {
    const a = await cargarAjustes(supabaseAdmin());
    comision = a.comision;
    pagos = a.pagos;
  } catch { /* valores por defecto */ }
  const dias = [...new Set(pagos.dias_pago)].filter(d => d >= 0 && d <= 6).sort();
  const diasPagoTexto = dias.length >= 7 ? 'todos los días' : dias.length ? dias.map(d => DIAS[d]).join(', ') : 'los días que fije el administrador';
  return { comisionPct: Math.round(comision * 1000) / 10, pagos, diasPagoTexto };
}
