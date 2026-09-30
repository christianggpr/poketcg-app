import { supabaseServer } from '@/lib/supabase/server';
import { json, leerJson } from '@/lib/auth-servidor';

export const runtime = 'nodejs';
export const maxDuration = 60;

type CajaV1 = { id: string; name: string; desc?: string; order?: number; mode?: string; setOrder?: string };
type EntradaV1 = { id: string; cardId?: string | null; custom?: { name?: string; set?: string; number?: string } | null; boxId: string; qty?: number; variant?: string; lang?: string; cond?: string; note?: string; pos?: number; addedAt?: number };

/**
 * Importa un respaldo de PokéBóveda v1 en dos pasos (con la sesión del usuario; RLS protege los datos):
 *   { paso: 'cajas', modo: 'reemplazar'|'combinar', cajas: [...] } → { mapa: { idV1: uuid } }
 *   { paso: 'entradas', mapa, entradas: [...] }                    → { insertadas, sinCatalogo }
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'Inicia sesión.' }, 401);
  const b = await leerJson(req);

  if (b.paso === 'cajas') {
    const cajas = Array.isArray(b.cajas) ? (b.cajas as CajaV1[]) : [];
    if (cajas.length > 200) return json({ ok: false, error: 'Demasiadas cajas.' }, 400);
    if (b.modo === 'reemplazar') {
      const e1 = await supabase.from('entradas').delete().eq('usuario_id', user.id);
      const e2 = await supabase.from('cajas').delete().eq('usuario_id', user.id);
      if (e1.error || e2.error) return json({ ok: false, error: 'No se pudo vaciar la colección actual.' }, 500);
    }
    const { data: existentes } = await supabase.from('cajas').select('id, nombre, orden').eq('usuario_id', user.id);
    const porNombre = new Map((existentes || []).map(c => [c.nombre.trim().toLowerCase(), c.id]));
    let orden = (existentes || []).reduce((m, c) => Math.max(m, c.orden), 0);
    const mapa: Record<string, string> = {};
    const nuevas: { nombre: string; descripcion: string; orden: number; modo: string; orden_colecciones: string; idV1: string }[] = [];
    for (const c of cajas.sort((a, b2) => (a.order || 0) - (b2.order || 0))) {
      const nombre = String(c.name || '').trim() || 'Caja';
      const ya = porNombre.get(nombre.toLowerCase());
      if (ya && b.modo !== 'reemplazar') { mapa[c.id] = ya; continue; }
      nuevas.push({ nombre, descripcion: String(c.desc || ''), orden: ++orden, modo: c.mode === 'manual' ? 'manual' : 'auto', orden_colecciones: c.setOrder === 'desc' ? 'desc' : 'asc', idV1: c.id });
    }
    if (nuevas.length) {
      const { data, error } = await supabase.from('cajas').insert(nuevas.map(({ idV1: _i, ...fila }) => fila)).select('id, nombre, orden');
      if (error) return json({ ok: false, error: 'No se pudieron crear las cajas: ' + error.message }, 500);
      const porOrden = new Map((data || []).map(c => [c.orden, c.id]));
      for (const n of nuevas) { const id = porOrden.get(n.orden); if (id) mapa[n.idV1] = id; }
    }
    return json({ ok: true, mapa });
  }

  if (b.paso === 'entradas') {
    const mapa = (b.mapa && typeof b.mapa === 'object' ? b.mapa : {}) as Record<string, string>;
    const entradas = Array.isArray(b.entradas) ? (b.entradas as EntradaV1[]) : [];
    if (entradas.length > 1000) return json({ ok: false, error: 'Lote demasiado grande.' }, 400);
    const ids = [...new Set(entradas.map(e => e.cardId).filter((x): x is string => typeof x === 'string' && x.length > 0))];
    const conocidas = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data } = await supabase.from('cartas').select('id').in('id', ids.slice(i, i + 500));
      for (const r of data || []) conocidas.add(r.id);
    }
    const filas = [];
    let sinCatalogo = 0;
    for (const e of entradas) {
      const caja = e.boxId && mapa[e.boxId] ? mapa[e.boxId] : null;
      let carta_id: string | null = null;
      let personalizada: { nombre: string; coleccion: string; numero: string } | null = null;
      if (e.cardId && conocidas.has(e.cardId)) carta_id = e.cardId;
      else if (e.custom && (e.custom.name || e.custom.set)) personalizada = { nombre: String(e.custom.name || 'Carta'), coleccion: String(e.custom.set || ''), numero: String(e.custom.number || '') };
      else if (e.cardId) { sinCatalogo++; personalizada = { nombre: 'Carta ' + e.cardId, coleccion: e.cardId.replace(/-[^-]+$/, ''), numero: e.cardId.replace(/^.*-/, '') }; }
      else continue;
      filas.push({
        carta_id, personalizada, caja_id: caja, cantidad: Math.max(1, Math.min(9999, parseInt(String(e.qty || 1), 10) || 1)),
        acabado: String(e.variant || '').slice(0, 20), idioma: String(e.lang || '').slice(0, 10), condicion: String(e.cond || '').slice(0, 40), nota: String(e.note || '').slice(0, 500),
        posicion: typeof e.pos === 'number' ? e.pos : null,
        creado_en: e.addedAt && e.addedAt > 0 ? new Date(e.addedAt).toISOString() : new Date().toISOString()
      });
    }
    if (filas.length) {
      const { error } = await supabase.from('entradas').insert(filas);
      if (error) return json({ ok: false, error: 'No se pudieron guardar las cartas: ' + error.message }, 500);
    }
    return json({ ok: true, insertadas: filas.length, sinCatalogo });
  }
  return json({ ok: false, error: 'Paso desconocido.' }, 400);
}
