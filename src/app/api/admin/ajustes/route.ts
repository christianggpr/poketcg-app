import { supabaseAdmin } from '@/lib/supabase/admin';
import { esAdminActual } from '@/lib/admin-servidor';
import { cargarAjustes, guardarAjustes, renovarTipoCambio } from '@/lib/ajustes';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await esAdminActual())) return json({ ok: false, error: 'Solo el administrador.' }, 403);
  const admin = supabaseAdmin();
  const ajustes = await cargarAjustes(admin, true);
  const { data } = await admin.from('ajustes_globales').select('clave, valor, actualizado_en').in('clave', ['fx', 'fx_respaldo', 'pisos', 'comision']);
  return json({ ok: true, ajustes, filas: data || [] });
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
  await guardarAjustes(admin, datos);
  return json({ ok: true, ajustes: await cargarAjustes(admin, true) });
}
