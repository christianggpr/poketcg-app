// Mazos meta (Fase 2 · D): descarga de arquetipos y listas de Limitless en el servidor (tarea diaria),
// agrupación en variantes (≥ 90 % de coincidencia) y guardado en mazos_arquetipos / mazos_variantes / mazos_listas.
// Si Limitless falla, se conserva la última versión guardada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { agruparVariantes, parsearArquetipos, parsearLista, parsearListasDeArquetipo, type CartaMazo } from './mazos-core';

const BASE = process.env.LIMITLESS_BASE || 'https://limitlesstcg.com';
const FORMATO = process.env.LIMITLESS_FORMATO || 'standard';
const PERIODO = process.env.LIMITLESS_PERIODO || '3months';
const MAX_ARQUETIPOS = parseInt(process.env.LIMITLESS_MAX_ARQUETIPOS || '20', 10);
const MAX_LISTAS = parseInt(process.env.LIMITLESS_MAX_LISTAS || '8', 10);

async function descargar(ruta: string): Promise<string> {
  const r = await fetch(BASE + ruta, { headers: { 'User-Agent': 'PokeTCG/2.0 (poketcg.pe; contacto: info@poketcg.pe)', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Limitless ${ruta}: HTTP ${r.status}`);
  return r.text();
}

export type CursorMazos = { inicio: string; ids: number[]; i: number; listas: number; nuevas: number; errores?: string[] };

type Res = { hecho: boolean; cursor: CursorMazos; detalle: Record<string, unknown> };

/**
 * Avanza la actualización de mazos con un presupuesto de tiempo. Se llama en cada tick hasta que `hecho`.
 * Al terminar, borra los arquetipos que ya no están en el meta (con sus variantes y listas).
 */
export async function actualizarMazos(admin: SupabaseClient, presupuestoMs: number, cursor?: CursorMazos | null): Promise<Res> {
  const t0 = Date.now();
  const quedaTiempo = () => Date.now() - t0 < presupuestoMs;
  let c = cursor;
  if (!c) {
    const html = await descargar(`/decks?format=${FORMATO}&time=${PERIODO}&show=50`);
    const arquetipos = parsearArquetipos(html).slice(0, MAX_ARQUETIPOS);
    if (!arquetipos.length) throw new Error('Limitless no devolvió arquetipos (¿cambió la página?)');
    const inicio = new Date().toISOString();
    const { error } = await admin.from('mazos_arquetipos').upsert(arquetipos.map(a => ({ id: a.id, nombre: a.nombre, iconos: a.iconos, orden: a.orden, puntos: a.puntos, cuota: a.cuota, formato: FORMATO, actualizado: inicio })), { onConflict: 'id' });
    if (error) throw new Error('mazos_arquetipos: ' + error.message);
    c = { inicio, ids: arquetipos.map(a => a.id), i: 0, listas: 0, nuevas: 0 };
  }
  while (c.i < c.ids.length && quedaTiempo()) {
    const id = c.ids[c.i];
    try {
      await procesarArquetipo(admin, c, id);
    } catch (e) {
      // un arquetipo con problemas no detiene la carga de los demás: se anota y se sigue
      c.errores = [...(c.errores || []), `${id}: ${e instanceof Error ? e.message : String(e)}`].slice(-20);
    }
    c.i++;
  }
  const hecho = c.i >= c.ids.length;
  if (hecho) {
    if (c.errores && c.errores.length >= c.ids.length) throw new Error('Ningún arquetipo se pudo cargar: ' + c.errores[0]);
    // arquetipos que salieron del meta (y sus variantes y listas, en cascada)
    await admin.from('mazos_arquetipos').delete().lt('actualizado', c.inicio);
    await admin.from('ajustes_globales').upsert({ clave: 'mazos', valor: { actualizado: new Date().toISOString(), arquetipos: c.ids.length, listas: c.listas, nuevas: c.nuevas, errores: c.errores || [], formato: FORMATO, periodo: PERIODO }, actualizado_en: new Date().toISOString() });
  }
  return { hecho, cursor: c, detalle: { arquetipos: c.ids.length, procesados: c.i, listas: c.listas, nuevas: c.nuevas, errores: c.errores || [] } };
}

/** Descarga las listas de un arquetipo, guarda las nuevas y recalcula sus variantes. */
async function procesarArquetipo(admin: SupabaseClient, c: CursorMazos, id: number): Promise<void> {
  {
    const { data: arq } = await admin.from('mazos_arquetipos').select('nombre').eq('id', id).maybeSingle();
    const nombre = (arq?.nombre as string) || `Mazo ${id}`;
    const html = await descargar(`/decks/${id}?format=${FORMATO}&time=${PERIODO}`);
    const listas = parsearListasDeArquetipo(html).slice(0, MAX_LISTAS);
    // listas ya guardadas (no se vuelven a descargar)
    const { data: guardadas } = await admin.from('mazos_listas').select('id, puesto, jugador, torneo, iconos, cartas').in('id', listas.map(l => l.id));
    const porId = new Map((guardadas || []).map(g => [g.id as number, g]));
    const completas: { id: number; puesto: number | null; jugador: string; torneo: string; iconos: string[]; cartas: CartaMazo[] }[] = [];
    const pendientes = listas.filter(l => !porId.has(l.id));
    // descarga en paralelo de a 4
    for (let k = 0; k < pendientes.length; k += 4) {
      const lote = pendientes.slice(k, k + 4);
      const htmls = await Promise.all(lote.map(l => descargar(`/decks/list/${l.id}`).catch(() => '')));
      for (let j = 0; j < lote.length; j++) {
        const { cartas } = parsearLista(htmls[j]);
        if (!cartas.length) continue;
        completas.push({ ...lote[j], cartas });
        c.nuevas++;
      }
    }
    if (completas.length) {
      const unicas = [...new Map(completas.map(l => [l.id, l])).values()];
      const { error } = await admin.from('mazos_listas').upsert(unicas.map(l => ({ id: l.id, arquetipo_id: id, jugador: l.jugador, torneo: l.torneo, puesto: l.puesto, iconos: l.iconos, cartas: l.cartas })), { onConflict: 'id' });
      if (error) throw new Error('mazos_listas: ' + error.message);
    }
    for (const l of listas) {
      const g = porId.get(l.id);
      if (g) completas.push({ id: l.id, puesto: l.puesto, jugador: l.jugador, torneo: l.torneo, iconos: l.iconos, cartas: g.cartas as CartaMazo[] });
    }
    const grupos = agruparVariantes(completas, nombre);
    const filas = grupos.map((g, k) => ({
      id: `${id}-${k + 1}`, arquetipo_id: id, nombre: g.nombre, lista_id: g.representante.id, n_listas: g.listas.length, mejor_puesto: g.mejorPuesto,
      cartas: g.representante.cartas, orden: k + 1, jugador: g.representante.jugador, torneo: g.representante.torneo, actualizado: c.inicio
    }));
    if (filas.length) {
      const { error } = await admin.from('mazos_variantes').upsert(filas, { onConflict: 'id' });
      if (error) throw new Error('mazos_variantes: ' + error.message);
      await admin.from('mazos_variantes').delete().eq('arquetipo_id', id).lt('actualizado', c.inicio);
    }
    c.listas += completas.length;
  }
}
