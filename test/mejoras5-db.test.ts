/**
 * Mejoras 5 · bloque A: el script 0010_mejoras5.sql enlaza a su bolsillo las copias que "Ya la tengo" dejó en un álbum por
 * colección, solo cuando no hay duda; es idempotente. Usa PostgreSQL local con las migraciones reales (test/db/reiniciar.sh).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
let pool: pg.Pool | null = null;
const ids = { yo: 'a7a7a7a7-0001-4000-8000-000000000001', otro: 'a7a7a7a7-0002-4000-8000-000000000002' };
const SQL = fs.readFileSync(path.join(import.meta.dirname, '..', 'supabase', 'migrations', '0010_mejoras5.sql'), 'utf8');

async function q<T = Record<string, unknown>>(sql: string, vals: unknown[] = []): Promise<T[]> { return (await pool!.query(sql, vals)).rows as T[]; }
async function como<T>(uid: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool!.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}

before(async () => {
  const p = new pg.Pool({ connectionString: DB, max: 4, connectionTimeoutMillis: 3000 });
  try { await p.query('select 1'); pool = p; } catch { await p.end().catch(() => {}); return; }
  await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(ids)]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'm7-yo@poketcg.pe', '{"username":"m7_yo","nombres":"Yo","apellidos":"Mismo","telefono":"911111177","dni":"71111111","acepto_terminos":true}'),
    ($2, 'm7-otro@poketcg.pe', '{"username":"m7_otro","nombres":"Otra","apellidos":"Persona","telefono":"922222277","dni":"72222222","acepto_terminos":true}')`, [ids.yo, ids.otro]);
  await q(`insert into public.colecciones_tcg (id, nombre, region, total_cartas, total_impreso, fecha, abreviatura) values ('tst7', 'Colección M7', 'int', 3, 3, '2024-01-01', 'TS7') on conflict (id) do nothing`);
  await q(`insert into public.cartas (id, coleccion_id, numero, nombre, rareza, sin_datos) values ('tst7-1', 'tst7', '1', 'Bulbasaur', 'Rare', false), ('tst7-2', 'tst7', '2', 'Ivysaur', 'Common', false), ('tst7-3', 'tst7', '3', 'Venusaur', 'Common', false) on conflict (id) do nothing`);
});
after(async () => {
  if (!pool) return;
  await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(ids)]);
  await q(`delete from public.cartas where id like 'tst7%'`);
  await q(`delete from public.colecciones_tcg where id = 'tst7'`);
  await pool.end();
});
const conBase = (t: { skip: (m?: string) => void }) => { if (!pool) { t.skip('sin PostgreSQL local'); return false; } return true; };

const entrada = (uid: string, carta: string, cantidad: number, lugar: { caja?: string | null; album?: string | null } = {}, idioma = 'EN') => como(uid, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma, condicion, album_coleccion) values ($1, $2, $3, '', $4, '', $5) returning id`, [carta, lugar.caja || null, cantidad, idioma, lugar.album || null])).rows[0].id as string);
const album = (uid: string, nombre: string) => como(uid, async c => (await c.query(`insert into public.albumes (nombre, paginas, columnas, filas) values ($1, 1, 3, 3) returning id`, [nombre])).rows[0].id as string);
const bolsillo = (uid: string, albumId: string, indice: number, carta: string) => como(uid, async c => { await c.query(`insert into public.album_casillas (album_id, indice, carta_id, entrada_id) values ($1, $2, $3, null)`, [albumId, indice, carta]); });
type Cas = { indice: number; entrada_id: string | null };
type E = { id: string; album_coleccion: string | null; caja_id: string | null };

test('0010: la copia única guardada en el álbum por colección se enlaza al bolsillo; los casos con duda no se tocan; se puede pegar dos veces', async t => {
  if (!conBase(t)) return;
  const alb = await album(ids.yo, 'Carpeta M7');
  // caso claro: Bulbasaur en el bolsillo 0, una sola copia (cantidad 1) en el álbum por colección y única carta de tst7 ahí
  await bolsillo(ids.yo, alb, 0, 'tst7-1');
  const e1 = await entrada(ids.yo, 'tst7-1', 1, { album: 'tst7' });
  // con duda: Ivysaur en el bolsillo 1 pero con DOS copias en un Bulk (ninguna en el álbum por colección) → no se toca
  await bolsillo(ids.yo, alb, 1, 'tst7-2');
  const caja = await como(ids.yo, async c => (await c.query(`insert into public.cajas (nombre, orden) values ('Bulk M7', 1) returning id`)).rows[0].id as string);
  const e2a = await entrada(ids.yo, 'tst7-2', 1, { caja });
  const e2b = await entrada(ids.yo, 'tst7-2', 1, { caja }, 'ES');
  // otro usuario con la misma carta en su álbum por colección y sin bolsillo → no se toca
  const e3 = await entrada(ids.otro, 'tst7-1', 1, { album: 'tst7' });

  await q(SQL);
  let cas = await q<Cas>(`select indice, entrada_id from public.album_casillas where album_id = $1 order by indice`, [alb]);
  assert.equal(cas[0].entrada_id, e1, 'Bulbasaur quedó enlazado al bolsillo 0');
  assert.equal(cas[1].entrada_id, null, 'Ivysaur (dos copias) no se tocó');
  const ent1 = (await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e1]))[0];
  assert.equal(ent1.album_coleccion, null, 'la copia salió del álbum por colección');
  const ent2a = (await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e2a]))[0];
  assert.equal(ent2a.caja_id, caja);
  const ent2b = (await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e2b]))[0];
  assert.equal(ent2b.caja_id, caja);
  const ent3 = (await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e3]))[0];
  assert.equal(ent3.album_coleccion, 'tst7', 'la del otro usuario sigue en su álbum');

  // segunda pasada: nada cambia
  await q(SQL);
  cas = await q<Cas>(`select indice, entrada_id from public.album_casillas where album_id = $1 order by indice`, [alb]);
  assert.equal(cas[0].entrada_id, e1);
  assert.equal(cas[1].entrada_id, null);
});

test('0010: si la carta está en dos bolsillos sin copia, o el álbum por colección tiene más cartas de esa colección, no se toca', async t => {
  if (!conBase(t)) return;
  const alb1 = await album(ids.yo, 'Carpeta M7 bis');
  const alb2 = await album(ids.yo, 'Carpeta M7 tris');
  await bolsillo(ids.yo, alb1, 0, 'tst7-3');
  await bolsillo(ids.yo, alb2, 0, 'tst7-3');
  const e = await entrada(ids.yo, 'tst7-3', 1, { album: 'tst7' });
  await q(SQL);
  assert.equal((await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e]))[0].album_coleccion, 'tst7', 'dos bolsillos posibles: no se toca');
  // un solo bolsillo pero el álbum por colección tiene otra carta de tst7 en el mismo idioma → el álbum es real: no se toca
  await q(`delete from public.album_casillas where album_id = $1`, [alb2]);
  await entrada(ids.yo, 'tst7-2', 1, { album: 'tst7' });
  await q(SQL);
  assert.equal((await q<E>(`select id, album_coleccion, caja_id from public.entradas where id = $1`, [e]))[0].album_coleccion, 'tst7', 'álbum por colección con más cartas: no se toca');
});

test('0011 (bloque B): albumes.tipo_album (libre por defecto) y parametros; un tipo inválido se rechaza', async t => {
  if (!conBase(t)) return;
  const libre = await album(ids.yo, 'Carpeta M7 libre');
  assert.equal((await q<{ tipo_album: string; parametros: unknown }>(`select tipo_album, parametros from public.albumes where id = $1`, [libre]))[0].tipo_album, 'libre');
  const id = await como(ids.yo, async c => (await c.query(`insert into public.albumes (nombre, paginas, columnas, filas, tipo_album, parametros) values ('Bulbasaur M7', 2, 3, 3, 'pokemon', '{"dex":1,"evoluciones":true,"idioma":""}') returning id`)).rows[0].id as string);
  const fila = (await q<{ tipo_album: string; parametros: { dex: number; evoluciones: boolean } }>(`select tipo_album, parametros from public.albumes where id = $1`, [id]))[0];
  assert.equal(fila.tipo_album, 'pokemon');
  assert.deepEqual(fila.parametros, { dex: 1, evoluciones: true, idioma: '' });
  await assert.rejects(como(ids.yo, c => c.query(`insert into public.albumes (nombre, paginas, columnas, filas, tipo_album) values ('Malo M7', 1, 3, 3, 'otro')`)), /albumes_tipo_valido/);
});
