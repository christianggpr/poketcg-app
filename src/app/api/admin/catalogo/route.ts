import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { json, leerJson } from '@/lib/auth-servidor';
import { numKey, type Carta, type Coleccion } from '@/lib/catalogo';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function esAdmin(): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle();
  return data?.rol === 'admin';
}

/** Carga (o actualiza) el catálogo en la base de datos, por lotes. Solo administradores. */
export async function POST(req: Request) {
  if (!(await esAdmin())) return json({ ok: false, error: 'Solo el administrador puede hacer esto.' }, 403);
  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const b = await leerJson(req);
  const sets = Array.isArray(b.sets) ? (b.sets as Coleccion[]) : [];
  const cards = Array.isArray(b.cards) ? (b.cards as Carta[]) : [];
  if (sets.length > 500 || cards.length > 2000) return json({ ok: false, error: 'Lote demasiado grande.' }, 400);

  if (sets.length) {
    const filas = sets.map(s => ({
      id: s.id, nombre: s.n, nombre_es: s.ns || null, nombre_ja: s.nj || null, serie_id: s.s || null, serie: s.sn || null, serie_es: s.sns || null,
      abreviatura: s.ab || null, total_impreso: s.cc || null, total_cartas: s.ct || null, fecha: /^\d{4}-\d{2}-\d{2}$/.test(s.d || '') ? s.d : null,
      tcgdex_id: s.tid || null, region: s.rg === 'ja' ? 'ja' : 'int', ptcgio_id: s.p || null, simbolo_url: s.sym || null
    }));
    const { error } = await admin.from('colecciones_tcg').upsert(filas, { onConflict: 'id' });
    if (error) return json({ ok: false, error: 'Colecciones: ' + error.message }, 500);
  }
  if (cards.length) {
    const filas = cards.map(c => {
      const k = numKey(c.l);
      return {
        id: c.id, coleccion_id: c.s, numero: c.l, numero_orden: k[0] === 2 ? null : k[2], nombre: c.n, nombre_es: c.ns || null, nombre_ja: c.nj || null,
        categoria: ['P', 'T', 'E', '?'].includes(c.c) ? c.c : 'P', rareza: c.r || null, tipos: c.t || null,
        dex: c.dex && c.dex.length ? c.dex.map(d => Math.floor(Number(d))).filter(d => Number.isInteger(d)) : null, hp: c.hp ? Math.floor(Number(c.hp)) || null : null,
        ilustrador: c.il || null, regulacion: c.rm || null, ptcgio_id: c.p || null, sin_datos: !!c.sd
      };
    });
    const { error } = await admin.from('cartas').upsert(filas, { onConflict: 'id' });
    if (error) return json({ ok: false, error: 'Cartas: ' + error.message }, 500);
  }
  return json({ ok: true, sets: sets.length, cards: cards.length });
}

/** Resumen: cuántas colecciones y cartas hay cargadas. */
export async function GET() {
  if (!(await esAdmin())) return json({ ok: false, error: 'Solo el administrador puede hacer esto.' }, 403);
  const supabase = await supabaseServer();
  const [c1, c2, c3] = await Promise.all([
    supabase.from('colecciones_tcg').select('id', { count: 'exact', head: true }),
    supabase.from('cartas').select('id', { count: 'exact', head: true }),
    supabase.from('perfiles_publicos').select('id', { count: 'exact', head: true })
  ]);
  return json({ ok: true, colecciones: c1.count ?? 0, cartas: c2.count ?? 0, usuarios: c3.count ?? 0 });
}
