/**
 * Mejoras 2 · bloque B: reglas en la base para "el álbum es lo principal; el Bulk guarda las repetidas".
 *   dividir_entrada, ordenar_repetidas y llenar_albumes (supabase/migrations/0006_mejoras2.sql).
 * Usa PostgreSQL local con las migraciones reales (test/db/reiniciar.sh); si no responde, se omite.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://postgres:test@127.0.0.1:5432/poketcg_test';
pg.types.setTypeParser(1700, v => (v == null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v == null ? null : parseInt(v, 10)));

let pool: pg.Pool | null = null;
const ids = { yo: 'a6a6a6a6-0001-4000-8000-000000000001', otro: 'a6a6a6a6-0002-4000-8000-000000000002' };

async function q<T = Record<string, unknown>>(sql: string, vals: unknown[] = []): Promise<T[]> { return (await pool!.query(sql, vals)).rows as T[]; }
async function como<T>(uid: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool!.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [uid ? 'authenticated' : 'anon', uid || '']);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
const rpc = (uid: string | null, fn: string, args: unknown[]) => como(uid, async c => (await c.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args.map(a => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)))).rows[0].r as Record<string, unknown>);

before(async () => {
  const p = new pg.Pool({ connectionString: DB, max: 4, connectionTimeoutMillis: 3000 });
  try { await p.query('select 1'); pool = p; } catch { await p.end().catch(() => {}); return; }
  await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(ids)]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'm6-yo@poketcg.pe', '{"username":"m6_yo","nombres":"Yo","apellidos":"Mismo","telefono":"911111166","dni":"61111111","acepto_terminos":true}'),
    ($2, 'm6-otro@poketcg.pe', '{"username":"m6_otro","nombres":"Otra","apellidos":"Persona","telefono":"922222266","dni":"62222222","acepto_terminos":true}')`, [ids.yo, ids.otro]);
  await q(`insert into public.colecciones_tcg (id, nombre, region, total_cartas, total_impreso, fecha, abreviatura) values ('tst6', 'Colección M6', 'int', 3, 3, '2024-01-01', 'TS6'), ('tst6b', 'Otra M6', 'int', 1, 1, '2024-02-01', 'TSB') on conflict (id) do nothing`);
  await q(`insert into public.cartas (id, coleccion_id, numero, nombre, rareza, sin_datos) values ('tst6-1', 'tst6', '1', 'Pinsir', 'Rare', false), ('tst6-2', 'tst6', '2', 'Scyther', 'Common', false), ('tst6-3', 'tst6', '3', 'Heracross', 'Common', false), ('tst6b-1', 'tst6b', '1', 'Snorlax', 'Rare', false) on conflict (id) do nothing`);
});
after(async () => {
  if (!pool) return;
  await q(`delete from auth.users where id = any($1::uuid[])`, [Object.values(ids)]);
  await q(`delete from public.precios where carta_id like 'tst6%'`);
  await q(`delete from public.cartas where id like 'tst6%'`);
  await q(`delete from public.colecciones_tcg where id in ('tst6', 'tst6b')`);
  await pool.end();
});
const conBase = (t: { skip: (m?: string) => void }) => { if (!pool) { t.skip('sin PostgreSQL local'); return false; } return true; };

const caja = (nombre: string, enVenta = false) => como(ids.yo, async c => (await c.query(`insert into public.cajas (nombre, orden, en_venta) values ($1, (select coalesce(max(orden), 0) + 1 from public.cajas where usuario_id = $2), $3) returning id`, [nombre, ids.yo, enVenta])).rows[0].id as string);
const entrada = (carta: string, cantidad: number, lugar: { caja?: string | null; album?: string | null } = {}, idioma = 'EN') => como(ids.yo, async c => (await c.query(`insert into public.entradas (carta_id, caja_id, cantidad, acabado, idioma, condicion, album_coleccion) values ($1, $2, $3, '', $4, '', $5) returning id`, [carta, lugar.caja || null, cantidad, idioma, lugar.album || null])).rows[0].id as string);
const publicar = (entradaId: string, cantidad: number, precio: number) => como(ids.yo, async c => (await c.query(`insert into public.publicaciones (entrada_id, cantidad, tipo_precio, precio_pen) values ($1, $2, 'manual', $3) returning id`, [entradaId, cantidad, precio])).rows[0].id as string);
type E = { id: string; cantidad: number; caja_id: string | null; album_coleccion: string | null; posicion: number | null };
type P = { id: string; entrada_id: string; cantidad: number; estado: string; precio_pen: number; motivo_pausa: string | null };
const entradaDe = async (id: string) => (await q<E>(`select id, cantidad, caja_id, album_coleccion, posicion from public.entradas where id = $1`, [id]))[0];
const pubsDe = async (entradaId: string) => q<P>(`select id, entrada_id, cantidad, estado, precio_pen, motivo_pausa from public.publicaciones where entrada_id = $1 and estado in ('activa', 'pausada', 'reservada') order by creada`, [entradaId]);

test('dividir_entrada → Bulk: 5 Pinsir publicados en el álbum → 1 queda en la casilla (con su publicación) y 4 van al Bulk con la publicación original', async t => {
  if (!conBase(t)) return;
  const bulk = await caja('Bulk 1');
  const e = await entrada('tst6-1', 5, { album: 'tst6' });
  const pub = await publicar(e, 5, 10);
  const r = await rpc(ids.yo, 'dividir_entrada', [e, 4, bulk, null]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const original = await entradaDe(e); const nueva = await entradaDe(r.nueva as string);
  assert.equal(original.cantidad, 1); assert.equal(original.album_coleccion, 'tst6'); assert.equal(original.caja_id, null);
  assert.equal(nueva.cantidad, 4); assert.equal(nueva.caja_id, bulk); assert.equal(nueva.album_coleccion, null); assert.equal(nueva.posicion, 1);
  const pubNueva = await pubsDe(nueva.id); const pubOriginal = await pubsDe(e);
  assert.equal(pubNueva.length, 1); assert.equal(pubNueva[0].id, pub, 'la publicación original sigue a las repetidas'); assert.equal(pubNueva[0].cantidad, 4);
  assert.equal(pubOriginal.length, 1); assert.notEqual(pubOriginal[0].id, pub); assert.equal(pubOriginal[0].cantidad, 1); assert.equal(pubOriginal[0].precio_pen, 10); assert.equal(pubOriginal[0].estado, 'activa');
  assert.equal(r.publicacion_movida, true); assert.equal(r.copia_album_publicada, 1);
  // publicación parcial (2 de 5): se va entera al Bulk y la copia del álbum queda sin publicar
  const e2 = await entrada('tst6-2', 5, { album: 'tst6' });
  const pub2 = await publicar(e2, 2, 60);
  const r2 = await rpc(ids.yo, 'dividir_entrada', [e2, 4, bulk, null]);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal((await pubsDe(e2)).length, 0);
  const p2 = await pubsDe(r2.nueva as string);
  assert.equal(p2.length, 1); assert.equal(p2[0].id, pub2); assert.equal(p2[0].cantidad, 2); assert.equal(p2[0].estado, 'pausada'); assert.equal(p2[0].motivo_pausa, 'foto', 'más de S/ 50 sin foto sigue pausada');
  assert.equal((await entradaDe(r2.nueva as string)).posicion, 2, 'posición siguiente del Bulk');
  // cantidades inválidas y ajenas
  assert.match(String((await rpc(ids.yo, 'dividir_entrada', [e2, 1, bulk, null])).error), /quedar copias/);
  assert.match(String((await rpc(ids.otro, 'dividir_entrada', [e, 1, bulk, null])).error), /no existe/);
  assert.match(String((await rpc(ids.yo, 'dividir_entrada', [e, 0, null, null])).error), /inválida/);
});

test('dividir_entrada: con copias reservadas por un comprador no se toca; en una caja en venta las copias nuevas se publican solas', async t => {
  if (!conBase(t)) return;
  const bulk = await caja('Bulk 2');
  const e = await entrada('tst6-3', 3, { album: 'tst6' });
  const pub = await publicar(e, 3, 5);
  assert.equal((await rpc(ids.otro, 'reservar_copia', [pub, 1])).ok, true);
  const r = await rpc(ids.yo, 'dividir_entrada', [e, 2, bulk, null]);
  assert.equal(r.ok, false); assert.match(String(r.error), /reservadas/);
  assert.equal((await entradaDe(e)).cantidad, 3);
  await q(`update public.reservas set estado = 'liberada' where comprador_id = $1 and estado = 'activa'`, [ids.otro]);
  await q(`update public.publicaciones set reservadas = 0, estado = 'activa' where id = $1`, [pub]);
  // caja en venta y entrada sin publicar: la nueva se publica sola con sus 2 copias; la del álbum queda sin publicar
  const venta = await caja('Bulk en venta', true);
  const e2 = await entrada('tst6b-1', 3, { album: 'tst6b' });
  const r2 = await rpc(ids.yo, 'dividir_entrada', [e2, 2, venta, null]);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const p = await pubsDe(r2.nueva as string);
  assert.equal(p.length, 1); assert.equal(p[0].cantidad, 2);
  assert.equal((await pubsDe(e2)).length, 0);
});

test('ordenar_repetidas: varias entradas en una transacción (completas y divididas), con posiciones seguidas y omitidas', async t => {
  if (!conBase(t)) return;
  const bulk = await caja('Bulk 3');
  const a = await entrada('tst6-1', 3, { album: 'tst6' });        // 2 repetidas (se dividen)
  const b = await entrada('tst6-1', 1, { album: 'tst6' });        // segunda entrada de la misma carta: pasa entera
  const c = await entrada('tst6-2', 2, { album: 'tst6' });
  const pubC = await publicar(c, 2, 8);
  assert.equal((await rpc(ids.otro, 'reservar_copia', [pubC, 1])).ok, true);   // reservada: se omite
  const r = await rpc(ids.yo, 'ordenar_repetidas', [bulk, [{ entrada: a, cantidad: 2 }, { entrada: b, todo: true }, { entrada: c, cantidad: 1 }]]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.movidas, 2); assert.equal(r.copias, 3);
  assert.equal((r.omitidas as unknown[]).length, 1);
  assert.equal((await entradaDe(a)).cantidad, 1);
  const enBulk = await q<E>(`select id, cantidad, caja_id, album_coleccion, posicion from public.entradas where caja_id = $1 order by posicion`, [bulk]);
  assert.deepEqual(enBulk.map(x => [x.cantidad, x.posicion, x.album_coleccion]), [[2, 1, null], [1, 2, null]]);
  assert.equal(enBulk[1].id, b);
  assert.equal((await entradaDe(c)).cantidad, 2, 'la reservada no se tocó');
  await q(`update public.reservas set estado = 'liberada' where comprador_id = $1 and estado = 'activa'`, [ids.otro]);
});

test('llenar_albumes: del Bulk al álbum 1 copia por casilla vacía; la publicación se queda con lo que sigue en el Bulk', async t => {
  if (!conBase(t)) return;
  const bulk = await caja('Bulk 4');
  const uno = await entrada('tst6-3', 1, { caja: bulk }, 'ES');       // una copia: pasa entera
  const pubUno = await publicar(uno, 1, 4);
  const tres = await entrada('tst6-2', 3, { caja: bulk }, 'ES');      // tres copias: 1 al álbum, 2 siguen en el Bulk
  const pubTres = await publicar(tres, 3, 4);
  const ocupada = await entrada('tst6-1', 1, { caja: bulk }, 'ES');
  await entrada('tst6-1', 1, { album: 'tst6' }, 'ES');                // la casilla 1 del álbum ES ya tiene copia
  const r = await rpc(ids.yo, 'llenar_albumes', [[{ entrada: uno, set: 'tst6' }, { entrada: tres, set: 'tst6' }, { entrada: ocupada, set: 'tst6' }]]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.movidas, 2);
  assert.deepEqual((r.omitidas as { error: string }[]).map(x => x.error), ['casilla ocupada']);
  const u = await entradaDe(uno); assert.equal(u.album_coleccion, 'tst6'); assert.equal(u.caja_id, null);
  assert.equal((await pubsDe(uno))[0]?.id, pubUno, 'la publicación se mantiene al cambiar de lugar');
  const t3 = await entradaDe(tres); assert.equal(t3.cantidad, 2); assert.equal(t3.caja_id, bulk);
  const enAlbum = await q<E>(`select id, cantidad, caja_id, album_coleccion, posicion from public.entradas where usuario_id = $1 and carta_id = 'tst6-2' and album_coleccion = 'tst6' and idioma = 'ES'`, [ids.yo]);
  assert.equal(enAlbum.length, 1); assert.equal(enAlbum[0].cantidad, 1);
  const p3 = await pubsDe(tres); assert.equal(p3[0].id, pubTres); assert.equal(p3[0].cantidad, 2, 'la publicación se ajusta a las copias que quedan en el Bulk');
  assert.equal((await pubsDe(enAlbum[0].id)).length, 0);
});
