import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { cifrar } from '@/lib/cifrado';
import { leerDatosCobro, type DatosCobro } from '@/lib/cobro-servidor';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';

/** Mis datos de cobro (el número de cuenta se devuelve parcialmente oculto). */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const d = await leerDatosCobro(supabaseAdmin(), user.id);
  const ocultar = (s: string) => (s.length > 4 ? '•'.repeat(Math.max(0, s.length - 4)) + s.slice(-4) : s);
  return json({ ok: true, datos: d ? { ...d, numero: ocultar(d.numero), cuenta: ocultar(d.cuenta), cci: ocultar(d.cci) } : null });
}

/** Guarda mis datos de cobro: Yape/Plin (número) o banco (cuenta + CCI + titular). */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const b = await leerJson(req);
  const metodo = ['yape', 'plin', 'banco'].includes(String(b.metodo)) ? (String(b.metodo) as DatosCobro['metodo']) : null;
  if (!metodo) return json({ ok: false, error: 'Elige Yape, Plin o banco.' }, 400);
  const titular = String(b.titular || '').trim().slice(0, 80);
  const numero = String(b.numero || '').replace(/\D/g, '');
  const banco = String(b.banco || '').trim().slice(0, 60);
  const cuenta = String(b.cuenta || '').replace(/[^\d-]/g, '').slice(0, 30);
  const cci = String(b.cci || '').replace(/\D/g, '');
  if (!titular) return json({ ok: false, error: 'Escribe el nombre del titular (debe ser el tuyo).' }, 400);
  if (metodo !== 'banco' && !/^9\d{8}$/.test(numero)) return json({ ok: false, error: 'El número de Yape/Plin debe ser un celular de 9 dígitos.' }, 400);
  if (metodo === 'banco' && (!banco || cuenta.length < 8 || !/^\d{20}$/.test(cci))) return json({ ok: false, error: 'Para banco: nombre del banco, número de cuenta y CCI de 20 dígitos.' }, 400);
  const admin = supabaseAdmin();
  const fila = { usuario_id: user.id, metodo, titular, banco: metodo === 'banco' ? banco : '', cifrado: cifrar(JSON.stringify(metodo === 'banco' ? { cuenta, cci } : { numero })), actualizado: new Date().toISOString() };
  const { error } = await admin.from('datos_cobro').upsert(fila, { onConflict: 'usuario_id' });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}
