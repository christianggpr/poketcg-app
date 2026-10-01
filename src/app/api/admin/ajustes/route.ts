import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { cargarAjustes, guardarAjustes, renovarTipoCambio } from '@/lib/ajustes';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const ajustes = await cargarAjustes(admin, true);
  const { data } = await admin.from('ajustes_globales').select('clave, valor, actualizado_en').in('clave', ['fx', 'fx_respaldo', 'pisos', 'comision', 'pagos']);
  const pagos = (data || []).find(f => f.clave === 'pagos')?.valor || null;
  return json({ ok: true, ajustes, filas: data || [], pagos });
}

/** Guarda pisos, comisión y tipo de cambio de respaldo; con { renovarFx: true } descarga el cambio del día. */
export async function POST(req: Request) {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const b = await leerJson(req);
  if (b.renovarFx === true) {
    const r = await renovarTipoCambio(admin, true);
    return json({ ok: true, fx: r.fx, renovado: r.renovado, error: r.error });
  }
  const num = (v: unknown, min: number, max: number) => { const n = Number(v); return isFinite(n) && n >= min && n <= max ? n : null; };
  const pisos = b.pisos && typeof b.pisos === 'object' ? (b.pisos as Record<string, unknown>) : null;
  const fxr = b.fx_respaldo && typeof b.fx_respaldo === 'object' ? (b.fx_respaldo as Record<string, unknown>) : null;
  const datos: Parameters<typeof guardarAjustes>[1] = {};
  if (pisos) { const n = num(pisos.normal, 0, 1000), e = num(pisos.especial, 0, 1000); if (n == null || e == null) return json({ ok: false, error: 'Pisos inválidos.' }, 400); datos.pisos = { normal: n, especial: e }; }
  if (fxr) { const u = num(fxr.usd_pen, 1, 10), e = num(fxr.eur_pen, 1, 12); if (u == null || e == null) return json({ ok: false, error: 'Tipo de cambio inválido.' }, 400); datos.fx_respaldo = { usd_pen: u, eur_pen: e }; }
  if (b.comision != null) { const c = num(b.comision, 0, 0.5); if (c == null) return json({ ok: false, error: 'Comisión inválida (0 a 0.5).' }, 400); datos.comision = c; }
  // Fase 3: Yape, WhatsApp, días de pago y plazos
  if (b.pagos && typeof b.pagos === 'object') {
    const p = b.pagos as Record<string, unknown>;
    const { data: actual } = await admin.from('ajustes_globales').select('valor').eq('clave', 'pagos').maybeSingle();
    const v = { ...((actual?.valor as Record<string, unknown>) || {}) };
    if (p.yape_numero != null) { const t = String(p.yape_numero).replace(/\D/g, ''); if (!/^9\d{8}$/.test(t)) return json({ ok: false, error: 'El Yape debe ser un celular de 9 dígitos que empiece en 9.' }, 400); v.yape_numero = t; }
    if (p.yape_nombre != null) v.yape_nombre = String(p.yape_nombre).trim().slice(0, 60);
    if (p.whatsapp != null) { const t = String(p.whatsapp).replace(/\D/g, ''); if (t && !/^9\d{8}$/.test(t)) return json({ ok: false, error: 'El WhatsApp debe ser un celular de 9 dígitos que empiece en 9.' }, 400); v.whatsapp = t; }
    if (Array.isArray(p.dias_pago)) { const d = [...new Set(p.dias_pago.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort(); v.dias_pago = d; }
    if (p.modo_limite != null) { if (p.modo_limite !== 'sabado' && p.modo_limite !== 'dias') return json({ ok: false, error: 'Modo de plazo inválido.' }, 400); v.modo_limite = p.modo_limite; }
    for (const [k, min, max] of [['reserva_min', 5, 1440], ['confirmacion_dias', 1, 30], ['retiro_minimo', 0, 1000], ['liberacion_dias', 0, 30], ['entrega_dias', 1, 30], ['plazo_fecha_horas', 1, 240]] as const) {
      if (p[k] != null) { const n = num(p[k], min, max); if (n == null) return json({ ok: false, error: `Valor inválido para ${k}.` }, 400); v[k] = n; }
    }
    await admin.from('ajustes_globales').upsert({ clave: 'pagos', valor: v, actualizado_en: new Date().toISOString() });
  }
  await guardarAjustes(admin, datos);
  return json({ ok: true, ajustes: await cargarAjustes(admin, true) });
}
